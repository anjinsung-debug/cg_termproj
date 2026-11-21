'use strict';

// 선수 관절 트리 (담당: 안진성)
// HW1 drawRobotArm()의 계층 구조를 노드 배열로 일반화한 것.
//   관절 좌표계 frame = 부모 frame × translate(offset) × 관절 회전      (HW1의 shoulder / elbow / wrist)
//   도형 geometry    = frame × translate(center) × scaling(size)       (HW1의 upperArm / lowerArm 복사본)
// scale은 geometry 복사본에만 곱하므로 자식 관절에 상속되지 않는다 (HW1과 동일).
// 단위: 1 = 1야드, 선수는 +Z 방향을 보고 선다. 키 약 1.95야드.

// [추가] 노드는 부모보다 뒤에 와야 한다 (computeFrames가 순서대로 계산).
// shape: mesh는 'cube'(한 변 2) 또는 'sphere'(반지름 1)이므로 size는 반 길이(half extent)다.
const PLAYER_NODES = [
  { name: 'pelvis', parent: null, offset: [0, 0.97, 0],
    shape: { mesh: 'cube', center: [0, 0, 0], size: [0.18, 0.1, 0.11], look: 'pants' } },
  { name: 'torso', parent: 'pelvis', offset: [0, 0.1, 0],
    shape: { mesh: 'cube', center: [0, 0.3, 0], size: [0.22, 0.3, 0.13], look: 'jersey' } },
  { name: 'head', parent: 'torso', offset: [0, 0.62, 0],
    shape: { mesh: 'sphere', center: [0, 0.13, 0], size: [0.13, 0.13, 0.13], look: 'helmet' } },

  { name: 'upperArmL', parent: 'torso', offset: [0.28, 0.55, 0],
    shape: { mesh: 'cube', center: [0, -0.16, 0], size: [0.06, 0.16, 0.06], look: 'jersey' } },
  { name: 'lowerArmL', parent: 'upperArmL', offset: [0, -0.32, 0],
    shape: { mesh: 'cube', center: [0, -0.15, 0], size: [0.05, 0.15, 0.05], look: 'skin' } },
  { name: 'upperArmR', parent: 'torso', offset: [-0.28, 0.55, 0],
    shape: { mesh: 'cube', center: [0, -0.16, 0], size: [0.06, 0.16, 0.06], look: 'jersey' } },
  { name: 'lowerArmR', parent: 'upperArmR', offset: [0, -0.32, 0],
    shape: { mesh: 'cube', center: [0, -0.15, 0], size: [0.05, 0.15, 0.05], look: 'skin' } },

  { name: 'thighL', parent: 'pelvis', offset: [0.1, -0.05, 0],
    shape: { mesh: 'cube', center: [0, -0.24, 0], size: [0.08, 0.24, 0.08], look: 'pants' } },
  { name: 'shinL', parent: 'thighL', offset: [0, -0.48, 0],
    shape: { mesh: 'cube', center: [0, -0.22, 0], size: [0.06, 0.22, 0.06], look: 'pants' } },
  { name: 'thighR', parent: 'pelvis', offset: [-0.1, -0.05, 0],
    shape: { mesh: 'cube', center: [0, -0.24, 0], size: [0.08, 0.24, 0.08], look: 'pants' } },
  { name: 'shinR', parent: 'thighR', offset: [0, -0.48, 0],
    shape: { mesh: 'cube', center: [0, -0.22, 0], size: [0.06, 0.22, 0.06], look: 'pants' } },

  // 공은 오른손(하완 끝)의 자식: 손이 움직이면 같이 움직인다. 길쭉한 구(장축 X).
  { name: 'ball', parent: 'lowerArmR', offset: [0, -0.32, 0.06],
    shape: { mesh: 'sphere', center: [0, 0, 0], size: [0.15, 0.09, 0.09], look: 'ball' } },
];

// [추가] 관절 회전: pose[name] = [rx, ry, rz] (라디안), R = Ry × Rx × Rz.
// ponytail: 오일러 각 임시 사용. 키프레임 형식(쿼터니언)이 정해지면 이 함수만 교체한다.
function jointRotation(angles = [0, 0, 0]) {
  const [rx, ry, rz] = angles;
  return multiplyAll(rotationY(ry), rotationX(rx), rotationZ(rz));
}

// [추가] 모든 관절의 월드 좌표계 계산. rootMatrix는 선수 전체의 위치·방향.
// 반환: { 노드이름: 월드 frame 행렬 }. 카메라(1인칭=head, 공 시점=ball)도 여기서 꺼내 쓴다.
function computeFrames(nodes, pose, rootMatrix) {
  const frames = {};
  for (const node of nodes) {
    const parentFrame = node.parent ? frames[node.parent] : rootMatrix;
    frames[node.name] = multiplyAll(
      parentFrame, translation(...node.offset), jointRotation(pose[node.name]));
  }
  return frames;
}

// [추가] 도형을 그릴 모델 행렬 (HW1의 geometry 복사본에 해당)
function shapeMatrix(frame, shape) {
  return multiplyAll(frame, translation(...shape.center), scaling(...shape.size));
}

// [추가] 테스트용 달리기 자세. stride는 -1~1 (팔다리를 반대로 흔든다).
// rotationX(+)는 아래로 뻗은 팔다리를 뒤(-Z)로 보낸다. 앞으로 내밀려면 음수.
// ponytail: 허들 키프레임이 생기면 이 함수 대신 키프레임 보간 결과를 pose로 넘긴다.
function runPose(stride) {
  const swing = 0.6 * stride;
  return {
    thighL: [-swing, 0, 0],
    shinL: [Math.max(-swing, 0) * 1.2, 0, 0],  // 뒤로 간 다리만 무릎을 굽힌다
    thighR: [swing, 0, 0],
    shinR: [Math.max(swing, 0) * 1.2, 0, 0],
    upperArmL: [swing, 0, 0],
    lowerArmL: [-0.8, 0, 0],
    upperArmR: [-0.3, 0, 0],                  // 공을 든 팔은 몸에 붙인다
    lowerArmR: [-1.3, 0, 0],
  };
}
