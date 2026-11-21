'use strict';

// 카메라 시점 3종 (담당: 안진성)
// HW2 app.js의 cameraMode 구조 기반: 모드마다 View 행렬과 FOV를 정하고,
// 카메라가 들어가 있는 물체는 그리지 않는다 (HW2 지구 시점에서 지구를 안 그리는 것과 같은 이유).
//
// 원리 (Ch.05): View 행렬 = 카메라 월드 행렬의 역행렬.
//   1인칭은 머리 노드의 월드 행렬을 직접 inverse() 하고,
//   중계·공 시점은 lookAt()으로 만든다 (lookAt도 카메라 월드 행렬의 역행렬과 같다 → tests/check.js).
//
// 좌표: 1 = 1야드, z = 필드 길이(러닝백 진행) 방향, x = 필드 폭 방향, y = 위.

// [추가] 1/2/3키 순서
const CAMERA_MODES = ['broadcast', 'firstPerson', 'ball'];
const CAMERA_LABELS = { broadcast: '1 중계', firstPerson: '2 러닝백 1인칭', ball: '3 공 시점' };

const degToRad = (deg) => (deg * Math.PI) / 180;
const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// [추가] 1) 중계 시점: 사이드라인 바깥 높은 곳(기자석)에서 러닝백을 따라 패닝.
// 카메라는 진행 방향(z)으로 60%만 따라가서, 멀어질수록 살짝 비스듬해지는 중계 느낌을 낸다.
// orbit {yaw, pitch, zoom}: 마우스 드래그·휠로 더한 값 (놓으면 main.js에서 0으로 돌아감).
const BROADCAST = {
  side: -30,          // 사이드라인 바깥 거리 (x)
  height: 14,         // 기자석 높이 (y)
  follow: 0.6,        // 진행 방향 추적 비율
  lead: [0, 1, 1.5],  // 러닝백보다 앞쪽을 조금 더 보여줌
  fov: 18,            // 망원(좁은 화각) = 중계 특유의 압축된 원근감. 화면 세로 약 10야드
  hurdleFov: 11,      // 허들 순간 줌인
  hurdle: [1.95, 2.7], // 허들 구간 (장면 시간)
};

function broadcastCamera(runnerPos, time, orbit = { yaw: 0, pitch: 0, zoom: 1 }) {
  const target = [runnerPos[0] + BROADCAST.lead[0], BROADCAST.lead[1], runnerPos[2] + BROADCAST.lead[2]];
  const base = [BROADCAST.side, BROADCAST.height, runnerPos[2] * BROADCAST.follow];

  // 기본 위치를 target 기준 구면 좌표로 바꿔 드래그 회전·줌을 더한다 (기존 궤도 카메라 방식)
  const d = [base[0] - target[0], base[1] - target[1], base[2] - target[2]];
  const distance = Math.hypot(...d) * orbit.zoom;
  const yaw = Math.atan2(d[0], d[2]) + orbit.yaw;
  const pitch = Math.min(Math.max(Math.asin(d[1] / Math.hypot(...d)) + orbit.pitch, 0.05), 1.5);
  const eye = [
    target[0] + distance * Math.cos(pitch) * Math.sin(yaw),
    target[1] + distance * Math.sin(pitch),
    target[2] + distance * Math.cos(pitch) * Math.cos(yaw),
  ];

  // 허들 구간에서 화각을 좁혀 줌인 (들어갈 때·나올 때 모두 부드럽게)
  const [h0, h1] = BROADCAST.hurdle;
  const zoomIn = smoothstep(h0 - 0.3, h0, time) * (1 - smoothstep(h1, h1 + 0.3, time));
  const fov = BROADCAST.fov + (BROADCAST.hurdleFov - BROADCAST.fov) * zoomIn;

  return { eye, view: lookAt(eye, target, [0, 1, 0]), fov: degToRad(fov), near: 0.5, hide: [] };
}

// [추가] 2) 러닝백 1인칭: 머리 노드에 카메라를 붙인다.
// 카메라 월드 행렬 = 머리 frame × 눈 위치로 이동 × Y축 180° 회전.
//   (선수는 +Z를 보지만 OpenGL 카메라는 -Z를 보므로 뒤로 돌려야 같은 방향을 본다)
// View = inverse(카메라 월드 행렬). 스핀·허들 때 몸이 돌면 화면도 같이 돈다.
const EYE_OFFSET = [0, 0.15, 0.1];   // 머리 frame 기준 눈 위치 (헬멧 안쪽 앞)

function firstPersonCamera(headFrame) {
  const cameraWorld = multiplyAll(headFrame, translation(...EYE_OFFSET), rotationY(Math.PI));
  const eye = [cameraWorld[12], cameraWorld[13], cameraWorld[14]];
  return { eye, view: inverse(cameraWorld), fov: degToRad(70), near: 0.05, hide: ['head'] };
}

// [추가] 3) 공 시점: 공 위치에서 공이 움직이는 방향을 본다.
// 방향 = 다음 순간 위치 - 이전 순간 위치 (중앙 차분). 공의 자전은 무시해서 화면이 덜 어지럽게.
// 거의 멈춰 있으면 러닝백이 보는 방향(fallbackDir)을 쓴다.
function ballCamera(ballPrev, ballNow, ballNext, fallbackDir) {
  let dir = [ballNext[0] - ballPrev[0], ballNext[1] - ballPrev[1], ballNext[2] - ballPrev[2]];
  if (Math.hypot(...dir) < 1e-3) dir = fallbackDir;
  dir = normalize([dir[0], dir[1] * 0.3, dir[2]]);   // 위아래 흔들림을 줄임

  // 공 바로 앞에 눈을 둔다 (손·팔 메시 안에 카메라가 묻히지 않게)
  const eye = [ballNow[0] + dir[0] * 0.25, ballNow[1] + 0.08, ballNow[2] + dir[2] * 0.25];
  const target = [eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2]];
  return { eye, view: lookAt(eye, target, [0, 1, 0]), fov: degToRad(75), near: 0.05, hide: ['ball'] };
}
