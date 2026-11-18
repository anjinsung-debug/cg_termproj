'use strict';

// 기본 도형 메시. 모두 { positions, normals, texCoords, indices } 형식.

// HW2 Task 1 구 메시 그대로 사용 (단위 구, 반지름 1)
function createSphere(latitudeBands, longitudeBands) {
  const positions = [];
  const normals = [];
  const texCoords = [];
  const indices = [];

  for (let latitude = 0; latitude <= latitudeBands; latitude++) {
    const theta = latitude * Math.PI / latitudeBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let longitude = 0; longitude <= longitudeBands; longitude++) {
      const phi = longitude * 2 * Math.PI / longitudeBands;
      const x = Math.cos(phi) * sinTheta;
      const y = cosTheta;
      const z = Math.sin(phi) * sinTheta;

      positions.push(x, y, z);
      normals.push(x, y, z);
      texCoords.push(longitude / longitudeBands, 1 - latitude / latitudeBands);
    }
  }

  for (let latitude = 0; latitude < latitudeBands; latitude++) {
    for (let longitude = 0; longitude < longitudeBands; longitude++) {
      const first = latitude * (longitudeBands + 1) + longitude;
      const second = first + longitudeBands + 1;
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices),
  };
}

// HW1 정육면체(중심 0, 한 변 2)에 면별 법선과 UV를 추가한 버전.
// 면마다 법선이 다르므로 정점을 공유하지 않고 면당 4개씩 24개 정점을 쓴다.
function createCube() {
  // [법선 n, 면 위의 u축, v축]. u x v = n 이 되도록 골라 바깥에서 볼 때 CCW가 된다.
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],   // +X
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],   // -X
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],   // +Y
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],   // -Y
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],    // +Z
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],  // -Z
  ];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const positions = [];
  const normals = [];
  const texCoords = [];
  const indices = [];

  faces.forEach(([n, u, v], face) => {
    for (const [su, sv] of corners) {
      for (let k = 0; k < 3; k++) positions.push(n[k] + su * u[k] + sv * v[k]);
      normals.push(...n);
      texCoords.push((su + 1) / 2, (sv + 1) / 2);
    }
    const b = face * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices),
  };
}
