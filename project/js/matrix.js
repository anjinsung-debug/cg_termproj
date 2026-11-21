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

// [추가] Ch.02/Ch.05 4x4 역행렬 (여인수 전개). column-major 입출력.
// 카메라를 노드에 붙일 때 View = inverse(노드의 월드 행렬) 로 쓴다.
// 역행렬이 없으면(det = 0) null을 반환한다.
function inverse(m) {
  const [
    a00, a01, a02, a03,
    a10, a11, a12, a13,
    a20, a21, a22, a23,
    a30, a31, a32, a33,
  ] = m; // aCR: C번째 열의 R번째 행

  // 2x2 소행렬식들
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return null;
  const k = 1 / det;

  return new Float32Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * k,
    (a02 * b10 - a01 * b11 - a03 * b09) * k,
    (a31 * b05 - a32 * b04 + a33 * b03) * k,
    (a22 * b04 - a21 * b05 - a23 * b03) * k,
    (a12 * b08 - a10 * b11 - a13 * b07) * k,
    (a00 * b11 - a02 * b08 + a03 * b07) * k,
    (a32 * b02 - a30 * b05 - a33 * b01) * k,
    (a20 * b05 - a22 * b02 + a23 * b01) * k,
    (a10 * b10 - a11 * b08 + a13 * b06) * k,
    (a01 * b08 - a00 * b10 - a03 * b06) * k,
    (a30 * b04 - a31 * b02 + a33 * b00) * k,
    (a21 * b02 - a20 * b04 - a23 * b00) * k,
    (a11 * b07 - a10 * b09 - a12 * b06) * k,
    (a00 * b09 - a01 * b07 + a02 * b06) * k,
    (a31 * b01 - a30 * b03 - a32 * b00) * k,
    (a20 * b03 - a21 * b01 + a22 * b00) * k,
  ]);
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

