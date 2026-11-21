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

// ============================================================================
// [추가] 세레모니 (자유 기능, 담당: 안진성)
// 플레이가 끝난 뒤(SCENE_DURATION 이후) 러닝백만 이어서 움직인다. 수비수는 마지막 자세 그대로.
// 키프레임은 플레이 마지막 위치·방향 기준의 상대값으로 적고, 아래 fromPlayEnd()로 절대값으로 바꾼다.
// ============================================================================

const PLAY_END = KEYFRAMES.runner[KEYFRAMES.runner.length - 1];
const endCos = Math.cos(PLAY_END.yaw);
const endSin = Math.sin(PLAY_END.yaw);
// 러닝백 기준 방향(앞 = +Z)을 월드 방향으로: rotationY(PLAY_END.yaw)와 같은 계산
const fromRunnerDir = ([x, y, z]) => [x * endCos + z * endSin, y, -x * endSin + z * endCos];

function fromPlayEnd(local) {
  return local.map(({ time, pos, yaw, pose }) => {
    const d = fromRunnerDir(pos);
    return {
      time,
      pos: [PLAY_END.pos[0] + d[0], PLAY_END.pos[1] + d[1], PLAY_END.pos[2] + d[2]],
      yaw: PLAY_END.yaw + yaw,
      pose,
    };
  });
}

const standing = {
  upperArmR: [-0.3, 0, 0], lowerArmR: [-1.3, 0, 0],   // 공은 계속 몸에 붙여 든다
};
const armsUp = {                                        // 두 팔 번쩍
  torso: [-0.15, 0, 0],
  upperArmL: [-2.9, 0, -0.35], lowerArmL: [-0.2, 0, 0],
  upperArmR: [-2.9, 0, 0.35], lowerArmR: [-0.2, 0, 0],
};

// 댄스: 0.3초마다 좌우로 골반을 흔들고 팔을 번갈아 올린다 (같은 동작 반복이라 반복문으로 생성)
function danceSteps() {
  const steps = [];
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    steps.push({
      time: 0.6 + 0.3 * i,
      pos: [0.15 * s, -0.08, 1.0],
      yaw: 0.3 * s,
      pose: {
        pelvis: [0, 0, 0.15 * s],
        torso: [0, 0.3 * s, -0.2 * s],
        thighL: [s > 0 ? -0.5 : 0, 0, 0], shinL: [s > 0 ? 0.8 : 0.2, 0, 0],
        thighR: [s < 0 ? -0.5 : 0, 0, 0], shinR: [s < 0 ? 0.8 : 0.2, 0, 0],
        upperArmL: [s > 0 ? -2.6 : -0.6, 0, -0.6], lowerArmL: [-0.8, 0, 0],
        upperArmR: [-0.3, 0, 0], lowerArmR: [-1.3, 0, 0],
      },
    });
  }
  return steps;
}

const CELEBRATIONS = {
  // 스파이크: 공을 머리 위로 들었다가 바닥에 내리꽂고 두 팔을 든다. 공은 release 시점에 손을 떠난다.
  spike: {
    label: 'Q 스파이크',
    track: fromPlayEnd([
      { time: 0.0, pos: [0, 0, 0], yaw: 0, pose: runPose(1) },
      { time: 0.3, pos: [0, 0, 1.2], yaw: 0, pose: runPose(-0.4) },
      { time: 0.6, pos: [0, 0, 1.6], yaw: 0,
        pose: { torso: [-0.25, 0, 0], thighL: [-0.3, 0, 0], upperArmR: [-2.9, 0, 0], lowerArmR: [-0.3, 0, 0] } },
      { time: 0.75, pos: [0, -0.15, 1.8], yaw: 0,
        pose: { torso: [0.5, 0, 0], thighL: [-0.7, 0, 0], shinL: [0.9, 0, 0], thighR: [-0.2, 0, 0],
          shinR: [0.6, 0, 0], upperArmR: [-0.5, 0, 0], lowerArmR: [0, 0, 0] } },
      { time: 1.1, pos: [0, 0, 1.8], yaw: 0, pose: armsUp },
      { time: 1.5, pos: [0, 0, 1.8], yaw: 0,
        pose: { ...armsUp, lowerArmL: [-1.3, 0, 0], lowerArmR: [-1.3, 0, 0] } },  // 알통 자세
      { time: 2.4, pos: [0, 0, 1.8], yaw: 0, pose: armsUp },  // 공이 멈출 때까지 자세 유지
    ]),
    // 손을 떠나는 시각과 속도 (러닝백 기준 방향, 야드/초): 아래로 세게, 앞으로 조금
    release: { time: 0.72, velocity: [0, -14, 4] },
  },
  // 점프: 웅크렸다가 뛰어오르며 반 바퀴 돌고, 착지 후 왼손 주먹을 치켜든다
  jump: {
    label: 'W 점프',
    track: fromPlayEnd([
      { time: 0.0, pos: [0, 0, 0], yaw: 0, pose: runPose(1) },
      { time: 0.3, pos: [0, 0, 1.0], yaw: 0, pose: runPose(-0.3) },
      { time: 0.55, pos: [0, -0.25, 1.3], yaw: 0,
        pose: { ...crouch, upperArmL: [0.8, 0, 0] } },
      { time: 0.8, pos: [0, 0.9, 1.5], yaw: Math.PI * 0.6,
        pose: { thighL: [-0.6, 0, 0], shinL: [0.9, 0, 0], thighR: [-0.4, 0, 0], shinR: [0.7, 0, 0],
          upperArmL: [-3.0, 0, -0.2], ...standing } },
      { time: 1.05, pos: [0, -0.2, 1.7], yaw: Math.PI, pose: crouch },
      { time: 1.3, pos: [0, 0, 1.7], yaw: Math.PI,
        pose: { upperArmL: [-2.9, 0, -0.2], lowerArmL: [-0.9, 0, 0], ...standing } },
      { time: 1.6, pos: [0, 0, 1.7], yaw: Math.PI,
        pose: { upperArmL: [-3.0, 0, -0.2], lowerArmL: [-0.4, 0, 0], ...standing } },
    ]),
  },
  // 댄스: 멈춰 서서 좌우로 흔들기
  dance: {
    label: 'E 댄스',
    track: fromPlayEnd([
      { time: 0.0, pos: [0, 0, 0], yaw: 0, pose: runPose(1) },
      { time: 0.3, pos: [0, 0, 1.0], yaw: 0, pose: standing },
      ...danceSteps(),
      { time: 2.4, pos: [0, 0, 1.0], yaw: 0, pose: armsUp },
    ]),
  },
};
for (const c of Object.values(CELEBRATIONS)) c.duration = c.track[c.track.length - 1].time;

// [추가] 손을 떠난 공의 위치: 포물선 운동 + 바닥 튕김 (중력 10.7야드/s² = 9.8m/s²).
// 튈 때마다 세로 속도는 반대 방향으로 35%, 가로 속도는 70%만 남는다. 거의 안 튀면 멈춤.
const GRAVITY = -10.7;
const BALL_REST_Y = 0.1;

function ballFlight(p0, v0, t) {
  let [x, y, z] = p0;
  let [vx, vy, vz] = v0;
  let remaining = t;
  for (let bounce = 0; bounce < 12; bounce++) {
    // 바닥(BALL_REST_Y)에 닿는 시간: y + vy·τ + ½g·τ² = BALL_REST_Y 의 양수 근
    const c = y - BALL_REST_Y;
    const tHit = (-vy - Math.sqrt(vy * vy - 2 * GRAVITY * c)) / GRAVITY;
    if (remaining <= tHit) {
      return [x + vx * remaining, y + vy * remaining + 0.5 * GRAVITY * remaining * remaining, z + vz * remaining];
    }
    x += vx * tHit;
    z += vz * tHit;
    y = BALL_REST_Y;
    remaining -= tHit;
    vy = -(vy + GRAVITY * tHit) * 0.35;
    vx *= 0.7;
    vz *= 0.7;
    if (vy < 0.3) break;   // 거의 안 튀면 바닥에 멈춘다
  }
  return [x, BALL_REST_Y, z];
}

// [추가] HW2 calculateSceneState(time)에 해당: 모든 선수의 상태.
// celebration이 있으면 플레이가 끝난 뒤 러닝백만 세레모니 트랙을 따른다.
function sampleScene(time, celebration = null) {
  const scene = {};
  for (const name of Object.keys(KEYFRAMES)) scene[name] = sampleTrack(KEYFRAMES[name], time);
  if (celebration && time > SCENE_DURATION) {
    scene.runner = sampleTrack(CELEBRATIONS[celebration].track, time - SCENE_DURATION);
  }
  return scene;
}

// [추가] 러닝백 관절 frame. 스파이크로 공이 손을 떠난 뒤에는 공 frame만 따로 계산한다
// (계층에서 떨어져 나간 공 = 부모 없이 월드 좌표로 움직임).
function runnerFramesAt(time, celebration = null) {
  const runner = sampleScene(time, celebration).runner;
  const frames = computeFrames(PLAYER_NODES, runner.pose, runner.rootMatrix);
  const cel = celebration && CELEBRATIONS[celebration];
  const t = time - SCENE_DURATION;
  if (cel && cel.release && t > cel.release.time) {
    const atRelease = sampleTrack(cel.track, cel.release.time);
    const releaseFrame = computeFrames(PLAYER_NODES, atRelease.pose, atRelease.rootMatrix).ball;
    const flight = t - cel.release.time;
    const p = ballFlight([releaseFrame[12], releaseFrame[13], releaseFrame[14]],
      fromRunnerDir(cel.release.velocity), flight);
    const orientation = Float32Array.from(releaseFrame);
    orientation[12] = orientation[13] = orientation[14] = 0;     // 놓을 때의 방향만 유지
    frames.ball = multiplyAll(translation(...p), orientation, rotationX(-8 * Math.min(flight, 1.2)));
  }
  return frames;
}
