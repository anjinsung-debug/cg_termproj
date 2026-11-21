'use strict';
// [추가] 행렬·관절 트리 자가 점검. 실행: node project/tests/check.js
// 브라우저용 전역 함수 파일을 그대로 읽어 같은 전역 공간에서 실행한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const context = vm.createContext({ Float32Array, Math });
for (const file of ['matrix.js', 'player.js']) {
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

console.log('OK: inverse, lookAt=inverse(camera world), joint tree heights, hierarchy inheritance');
