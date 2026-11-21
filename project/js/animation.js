'use strict';

// 하이라이트 장면 키프레임과 재생 (담당: 안진성)
// HW2 task3_animation.js의 calculateSceneState(time) 방식: 장면 상태를 시간의 함수로 계산한다.
// 차이점: HW2는 각속도 × time 공식, 여기는 키프레임 사이 보간.
//
// 원본 영상 7~10초 구간을 프레임 단위로 보고 만든 근사 동작 (t = 영상 시간 - 7초):
//   0.0~1.0  러닝백이 사이드라인 쪽으로 달림, 수비수 1이 측면에서 접근
//   1.0~1.5  수비수 1과 접촉 → 러닝백이 360° 스핀으로 빠져나감, 수비수 1은 넘어짐
//   1.5~2.1  다시 달림, 수비수 2가 앞쪽에서 접근
//   2.1~2.7  수비수 2가 다리를 향해 다이빙 → 러닝백이 몸을 돌려 등진 채로 뛰어넘음 (노룩 허들)
//   2.7~3.0  착지 후 다시 앞을 보고 달림
// 단위: 1 = 1야드. 러닝백은 +Z 방향으로 진행.

const SCENE_DURATION = 3.0;

// [추가] 키프레임: { time, pos: [x, y, z], yaw, pose: { 관절: [rx, ry, rz] } }
// pos/yaw는 선수 루트(전체) 이동·회전, pose는 player.js 관절 회전. 빠진 관절은 [0, 0, 0].
// yaw는 연속값으로 적는다 (0 → 2π 처럼 한 바퀴 돌면 2π). 보간할 때 각이 튀지 않게 하기 위해서.
const TAU = Math.PI * 2;

const brace = {            // 접촉 순간: 무게중심을 낮추고 왼팔로 밀어냄
  torso: [0.35, 0, 0],
  thighL: [-0.7, 0, 0], shinL: [1.0, 0, 0],
  thighR: [-0.2, 0, 0], shinR: [0.6, 0, 0],
  upperArmL: [-1.4, 0, 0], lowerArmL: [-0.2, 0, 0],
  upperArmR: [-0.3, 0, 0], lowerArmR: [-1.3, 0, 0],
};
const spin = {             // 스핀 중: 팔을 몸에 붙이고 다리를 모음
  torso: [0.2, 0, 0],
  thighL: [-0.4, 0, 0], shinL: [0.7, 0, 0],
  thighR: [0.2, 0, 0], shinR: [0.4, 0, 0],
  upperArmL: [-0.4, 0, -0.3], lowerArmL: [-1.2, 0, 0],
  upperArmR: [-0.3, 0, 0], lowerArmR: [-1.3, 0, 0],
};
const crouch = {           // 도약 직전: 무릎을 굽힘
  torso: [0.4, 0, 0],
  thighL: [-0.9, 0, 0], shinL: [1.3, 0, 0],
  thighR: [-0.9, 0, 0], shinR: [1.3, 0, 0],
  upperArmL: [0.6, 0, 0], lowerArmL: [-0.6, 0, 0],
  upperArmR: [-0.3, 0, 0], lowerArmR: [-1.3, 0, 0],
};
const tuck = {             // 허들 정점: 무릎을 가슴 쪽으로 당김
  torso: [0.3, 0, 0],
  thighL: [-1.5, 0, 0], shinL: [1.9, 0, 0],
  thighR: [-1.2, 0, 0], shinR: [1.7, 0, 0],
  upperArmL: [-0.9, 0, -0.5], lowerArmL: [-0.5, 0, 0],
  upperArmR: [-0.3, 0, 0], lowerArmR: [-1.3, 0, 0],
};
const lunge = {            // 수비수: 상체를 숙이고 두 팔을 뻗음
  torso: [0.8, 0, 0],
  thighL: [-0.8, 0, 0], shinL: [0.9, 0, 0],
  thighR: [0.4, 0, 0], shinR: [0.3, 0, 0],
  upperArmL: [-1.6, 0, 0], upperArmR: [-1.6, 0, 0],
};
const dive = {             // 수비수: 몸 전체를 앞으로 눕혀 다이빙 (골반 관절 회전)
  pelvis: [1.45, 0, 0],
  thighL: [0.2, 0, 0], thighR: [0.1, 0, 0],
  upperArmL: [-2.8, 0, 0], upperArmR: [-2.8, 0, 0],
};
// 다이빙 자세에서 몸이 바닥에 닿도록 루트를 내리는 양 (골반 높이 0.97 → 약 0.25)
const DIVE_DROP = -0.72;

const KEYFRAMES = {
  runner: [
    { time: 0.00, pos: [0.0, 0, 0.0], yaw: 0, pose: runPose(1) },
    { time: 0.25, pos: [0.0, 0, 2.0], yaw: 0, pose: runPose(-1) },
    { time: 0.50, pos: [0.0, 0, 4.0], yaw: 0, pose: runPose(1) },
    { time: 0.75, pos: [0.0, 0, 5.8], yaw: 0, pose: runPose(-1) },
    { time: 1.00, pos: [0.1, -0.15, 7.1], yaw: 0.3, pose: brace },
    { time: 1.25, pos: [0.4, -0.1, 7.8], yaw: Math.PI, pose: spin },
    { time: 1.50, pos: [0.6, 0, 8.6], yaw: TAU, pose: runPose(1) },
    { time: 1.75, pos: [0.7, 0, 10.2], yaw: TAU, pose: runPose(-1) },
    { time: 2.00, pos: [0.8, 0, 11.8], yaw: TAU, pose: runPose(1) },
    { time: 2.15, pos: [0.85, -0.2, 12.5], yaw: TAU + 2.6, pose: crouch },
    { time: 2.35, pos: [0.9, 0.45, 13.4], yaw: TAU + Math.PI, pose: tuck },
    { time: 2.55, pos: [0.95, -0.1, 14.2], yaw: TAU + 3.6, pose: crouch },
    { time: 2.75, pos: [1.0, 0, 15.2], yaw: 2 * TAU, pose: runPose(-1) },
    { time: 3.00, pos: [1.0, 0, 17.0], yaw: 2 * TAU, pose: runPose(1) },
  ],
  defender1: [
    { time: 0.00, pos: [-4.5, 0, 9.5], yaw: 2.2, pose: runPose(1) },
    { time: 0.40, pos: [-3.2, 0, 8.9], yaw: 2.1, pose: runPose(-1) },
    { time: 0.80, pos: [-1.8, 0, 8.2], yaw: 2.0, pose: runPose(1) },
    { time: 1.00, pos: [-1.0, 0, 7.8], yaw: 2.0, pose: lunge },
    { time: 1.40, pos: [0.0, DIVE_DROP, 7.9], yaw: 1.9, pose: dive },
    { time: 3.00, pos: [0.0, DIVE_DROP, 7.9], yaw: 1.9, pose: dive },
  ],
  defender2: [
    { time: 0.00, pos: [4.0, 0, 19.0], yaw: -2.6, pose: runPose(1) },
    { time: 0.60, pos: [3.2, 0, 17.4], yaw: -2.6, pose: runPose(-1) },
    { time: 1.20, pos: [2.4, 0, 15.8], yaw: -2.6, pose: runPose(1) },
    { time: 1.80, pos: [1.6, 0, 14.3], yaw: -2.6, pose: runPose(-1) },
    { time: 2.10, pos: [1.3, 0, 13.8], yaw: -2.6, pose: lunge },
    { time: 2.35, pos: [0.9, DIVE_DROP, 13.0], yaw: -2.7, pose: dive },
    { time: 3.00, pos: [0.9, DIVE_DROP, 13.0], yaw: -2.7, pose: dive },
  ],
};

const lerp = (a, b, s) => a + (b - a) * s;
const lerpVec = (a = [0, 0, 0], b = [0, 0, 0], s) => a.map((v, i) => lerp(v, b[i], s));

// [추가] 트랙(키프레임 배열)에서 time 시점의 상태를 선형 보간으로 구한다.
// ponytail: 관절은 오일러 각 선형 보간. 쿼터니언 slerp(홍채운, Ch.11)가 생기면 pose 보간만 교체.
function sampleTrack(track, time) {
  const t = Math.min(Math.max(time, track[0].time), track[track.length - 1].time);
  let i = 0;
  while (i < track.length - 2 && track[i + 1].time <= t) i++;
  const a = track[i];
  const b = track[i + 1];
  const s = (t - a.time) / (b.time - a.time);

  const pose = {};
  for (const name of new Set([...Object.keys(a.pose), ...Object.keys(b.pose)])) {
    pose[name] = lerpVec(a.pose[name], b.pose[name], s);
  }
  const pos = lerpVec(a.pos, b.pos, s);
  const yaw = lerp(a.yaw, b.yaw, s);
  return { pos, yaw, pose, rootMatrix: multiply(translation(...pos), rotationY(yaw)) };
}

// [추가] HW2 calculateSceneState(time)에 해당: 모든 선수의 상태
function sampleScene(time) {
  const scene = {};
  for (const name of Object.keys(KEYFRAMES)) scene[name] = sampleTrack(KEYFRAMES[name], time);
  return scene;
}
