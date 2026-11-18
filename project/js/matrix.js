'use strict';

// HW2 제공 matrix.js 기반. 텀프로젝트에서 추가한 부분은 [추가] 표시.
// 모든 행렬은 column-major (m[column * 4 + row]).

function multiply(a, b) {
  const result = new Float32Array(16);

  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        result[column * 4 + row] +=
          a[k * 4 + row] * b[column * 4 + k];
      }
    }
  }

  return result;
}

function translation(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

// [추가] 축별 비균등 스케일. scaling(s)처럼 인자 하나면 기존과 동일하게 균등 스케일.
function scaling(x, y = x, z = x) {
  return new Float32Array([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1,
  ]);
}

// [추가] 여러 행렬을 왼쪽부터 차례로 곱한다: multiplyAll(A, B, C) = A * B * C
function multiplyAll(...matrices) {
  return matrices.reduce(multiply);
}

// [추가] X축 회전 (rotationY와 같은 규약)
function rotationX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

// [추가] Z축 회전 (rotationY와 같은 규약)
function rotationZ(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

// [추가] Normal Matrix = (Model 3x3)^-1 의 전치. column-major 3x3 반환.
// 비균등 스케일이 있으면 mat3(model)로 법선을 변환할 때 법선이 표면에 수직이 아니게 되므로 필요하다.
// 여인수 행렬의 각 행은 원래 행렬의 나머지 두 행의 외적이다.
function normalMatrix(m) {
  const r0 = [m[0], m[4], m[8]];
  const r1 = [m[1], m[5], m[9]];
  const r2 = [m[2], m[6], m[10]];
  const c0 = cross(r1, r2);
  const c1 = cross(r2, r0);
  const c2 = cross(r0, r1);
  const det = dot(r0, c0);

  return new Float32Array([
    c0[0], c1[0], c2[0],
    c0[1], c1[1], c2[1],
    c0[2], c1[2], c2[2],
  ].map((value) => value / det));
}

function rotationY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  const range = 1 / (near - far);

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * range, -1,
    0, 0, 2 * near * far * range, 0,
  ]);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return vector.map((value) => value / length);
}

function lookAt(eye, target, up) {
  const zAxis = normalize([
    eye[0] - target[0],
    eye[1] - target[1],
    eye[2] - target[2],
  ]);
  const xAxis = normalize(cross(up, zAxis));
  const yAxis = cross(zAxis, xAxis);

  return new Float32Array([
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
  ]);
}

