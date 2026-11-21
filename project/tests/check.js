'use strict';
// [추가] 행렬·관절 트리 자가 점검. 실행: node project/tests/check.js
// 브라우저용 전역 함수 파일을 그대로 읽어 같은 전역 공간에서 실행한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const context = vm.createContext({ Float32Array, Math });
for (const file of ['matrix.js', 'player.js', 'animation.js', 'camera.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
}
const run = (code) => vm.runInContext(code, context);
const near = (a, b, msg) => a.forEach((v, i) => assert(Math.abs(v - b[i]) < 1e-4, `${msg}: [${i}] ${v} != ${b[i]}`));
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// 1) inverse(M) × M = I (이동·회전·비균등 스케일이 섞인 행렬)
const M = run('multiplyAll(translation(3, -2, 5), rotationY(0.7), rotationX(-0.4), scaling(2, 0.5, 1.5))');
near(run('multiply')(run('inverse')(M), M), I, 'inverse(M)*M');
near(run('multiply')(M, run('inverse')(M)), I, 'M*inverse(M)');
assert.strictEqual(run('inverse(scaling(1, 0, 1))'), null, '특이행렬은 null');

// 2) 카메라 원리: lookAt은 카메라 월드 행렬의 역행렬이다
const view = run('lookAt([4, 3, 6], [0, 1, 0], [0, 1, 0])');
const cameraWorld = run('inverse')(view);
near([cameraWorld[12], cameraWorld[13], cameraWorld[14]], [4, 3, 6], 'inverse(view)의 위치 = eye');

// 3) 관절 트리: 서 있는 자세에서 발끝은 바닥 근처, 머리 꼭대기는 약 1.95야드
const frames = run('computeFrames(PLAYER_NODES, {}, translation(0, 0, 0))');
// 노드 좌표계의 한 점(local)을 월드로 옮겼을 때의 y (column-major: 행 1 = 인덱스 1, 5, 9, 13)
const pointY = (name, local) => { const f = frames[name]; return f[1] * local[0] + f[5] * local[1] + f[9] * local[2] + f[13]; };
assert(Math.abs(pointY('shinL', [0, -0.44, 0])) < 0.05, '발끝 높이 ≈ 0');
assert(Math.abs(pointY('head', [0, 0.26, 0]) - 1.95) < 0.05, '머리 꼭대기 ≈ 1.95');

// 4) 계층 상속: 루트를 90° 돌리면 공(손의 자식)도 같이 돈다
const turned = run('computeFrames(PLAYER_NODES, runPose(0), rotationY(Math.PI / 2))');
const straight = run('computeFrames(PLAYER_NODES, runPose(0), translation(0, 0, 0))');
const ballA = [straight.ball[12], straight.ball[13], straight.ball[14]];
const ballB = [turned.ball[12], turned.ball[13], turned.ball[14]];
near(ballB, [ballA[2], ballA[1], -ballA[0]], '루트 회전이 공까지 상속');

// 5) 키프레임 보간: 키프레임 시각에는 그 값 그대로, 사이에는 중간값, 범위 밖은 끝값
const track = [
  { time: 0, pos: [0, 0, 0], yaw: 0, pose: { torso: [0, 0, 0] } },
  { time: 1, pos: [2, 0, 4], yaw: 2, pose: { torso: [1, 0, 0], head: [0, 1, 0] } },
  { time: 3, pos: [2, 0, 8], yaw: 4, pose: {} },
];
context.track = track;
const at = (t) => run(`sampleTrack(track, ${t})`);
near(at(1).pos, [2, 0, 4], '키프레임 시각');
near(at(0.5).pos, [1, 0, 2], '중간 위치');
assert(Math.abs(at(0.5).yaw - 1) < 1e-9, '중간 yaw');
near(at(0.5).pose.head, [0, 0.5, 0], '한쪽에만 있는 관절은 0에서 보간');
near(at(2).pose.torso, [0.5, 0, 0], '다음 키프레임에 없으면 0으로');
near(at(-1).pos, [0, 0, 0], '시작 전은 첫 키프레임');
near(at(9).pos, [2, 0, 8], '끝 이후는 마지막 키프레임');

// 6) 실제 장면 데이터: 트랙이 시간순이고 장면 길이를 덮는다
for (const [name, frames] of Object.entries(run('KEYFRAMES'))) {
  frames.forEach((f, i) => i && assert(f.time > frames[i - 1].time, `${name} 키프레임 시간순`));
  assert.strictEqual(frames[frames.length - 1].time, run('SCENE_DURATION'), `${name} 끝 = 장면 길이`);
}

// 7) 카메라: 보여야 할 것이 카메라 앞(View 공간 z < 0)에 있는지
const toView = (view, p) => {
  const v = run('multiply')(view, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1]));
  return [v[12], v[13], v[14]];
};
// 1인칭: +Z를 보고 선 선수의 눈 앞 5야드가 화면 정면에 있다
const standing = run('computeFrames(PLAYER_NODES, {}, translation(0, 0, 0))');
context.headFrame = standing.head;
const fp = run('firstPersonCamera(headFrame)');
const ahead = toView(fp.view, [fp.eye[0], fp.eye[1], fp.eye[2] + 5]);
assert(ahead[2] < -4.9 && Math.abs(ahead[0]) < 1e-3, `1인칭: 앞쪽이 정면 ${ahead}`);
near(fp.eye, [0, 0.97 + 0.1 + 0.62 + 0.15, 0.1], '1인칭: 눈 위치 = 머리 frame + 눈 오프셋');
// 공 시점: +Z로 움직이는 공은 +Z를 본다
const bc = run('ballCamera([0, 1, 0], [0, 1, 1], [0, 1, 2], [1, 0, 0])');
assert(toView(bc.view, [0, 1, 10])[2] < 0, '공 시점: 진행 방향이 앞');
const still = run('ballCamera([0, 1, 0], [0, 1, 0], [0, 1, 0], [1, 0, 0])');
assert(toView(still.view, [10, 1, 0])[2] < 0, '공 시점: 멈추면 러닝백 정면 방향');
// 중계: 러닝백이 화면 가운데 근처에 보이고, 허들 구간에서는 줌인
const br = run('broadcastCamera([1, 0, 12], 1.0)');
const r = toView(br.view, [1, 1, 12]);
assert(r[2] < 0 && Math.abs(r[0] / r[2]) < 0.1, `중계: 러닝백이 화면 중앙 ${r}`);
assert(run('broadcastCamera([1, 0, 12], 2.3)').fov < br.fov, '중계: 허들 때 화각이 좁아짐');

console.log('OK: inverse, lookAt=inverse(camera world), joint tree heights, hierarchy inheritance, keyframe sampling, cameras');
