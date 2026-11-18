'use strict';

// HW2 common/app.js 구조를 기반으로 한 텀프로젝트 뼈대.
// 장면(drawScene)과 키 입력(updateState)은 주제에 맞게 교체한다.
(function main() {
  const canvas = document.getElementById('glCanvas');
  const status = document.getElementById('status');
  const gl = canvas.getContext('webgl');

  if (!gl) {
    status.textContent = '오류: 이 브라우저는 WebGL을 지원하지 않습니다.';
    return;
  }

  // ==========================================================================
  // 1. Shader: HW2 vertex shader + Phong lighting (ambient + diffuse + specular)
  // ==========================================================================

  const vertexShaderSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aTexCoord;

    uniform mat4 uModelMatrix;
    uniform mat3 uNormalMatrix;
    uniform mat4 uMvpMatrix;
    uniform vec2 uUvScale;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vTexCoord;

    void main() {
      vWorldPosition = (uModelMatrix * vec4(aPosition, 1.0)).xyz;
      // HW2의 mat3(uModelMatrix) 대신 Normal Matrix 사용 (비균등 스케일 대응)
      vNormal = uNormalMatrix * aNormal;
      vTexCoord = aTexCoord * uUvScale;
      gl_Position = uMvpMatrix * vec4(aPosition, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;

    uniform sampler2D uTexture;
    uniform vec3 uLightPosition;
    uniform vec3 uCameraPosition;
    uniform vec3 uLightColor;

    // 재질별 Phong 계수 (예: 금속은 ks와 shininess를 크게)
    uniform float uKa;
    uniform float uKd;
    uniform float uKs;
    uniform float uShininess;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vTexCoord;

    void main() {
      vec3 baseColor = texture2D(uTexture, vTexCoord).rgb;

      vec3 N = normalize(vNormal);
      vec3 L = normalize(uLightPosition - vWorldPosition);
      vec3 V = normalize(uCameraPosition - vWorldPosition);
      vec3 R = reflect(-L, N);

      float diffuse = max(dot(N, L), 0.0);
      // 빛이 닿지 않는 면에는 하이라이트가 생기지 않도록 한다.
      float specular = diffuse > 0.0 ? pow(max(dot(R, V), 0.0), uShininess) : 0.0;

      vec3 color =
        baseColor * (uKa + uKd * diffuse) * uLightColor +
        uKs * specular * uLightColor;

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader 컴파일 오류:\n${message}`);
    }
    return shader;
  }

  function createProgram(vertexSource, fragmentSource) {
    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program 연결 오류:\n${gl.getProgramInfoLog(program)}`);
    }
    return program;
  }

  // ==========================================================================
  // 2. 메시 버퍼
  // ==========================================================================

  function createMesh(data) {
    const makeBuffer = (target, array) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(target, buffer);
      gl.bufferData(target, array, gl.STATIC_DRAW);
      return buffer;
    };

    return {
      position: makeBuffer(gl.ARRAY_BUFFER, data.positions),
      normal: makeBuffer(gl.ARRAY_BUFFER, data.normals),
      texCoord: makeBuffer(gl.ARRAY_BUFFER, data.texCoords),
      index: makeBuffer(gl.ELEMENT_ARRAY_BUFFER, data.indices),
      count: data.indices.length,
    };
  }

  // ==========================================================================
  // 3. 텍스처 (HW2 createTexture 기반 + filtering 선택)
  // ==========================================================================

  const isPowerOf2 = (n) => (n & (n - 1)) === 0;

  // WebGL 1에서 mipmap과 REPEAT는 2의 거듭제곱 크기 텍스처에서만 쓸 수 있다.
  // - 2의 거듭제곱: mipmap + 트라이리니어 필터링, 반복(REPEAT) 가능 → 바닥처럼 타일링하는 면
  // - 그 외(예: 1774x887 지구 텍스처): LINEAR + CLAMP_TO_EDGE
  function setTextureParameters(width, height) {
    const pot = isPowerOf2(width) && isPowerOf2(height);
    const wrap = pot ? gl.REPEAT : gl.CLAMP_TO_EDGE;

    if (pot) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pot ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }

  // 이미지가 로드되기 전에는 1x1 단색으로 그린다.
  function loadTexture(imagePath, defaultColor = [255, 255, 255]) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([...defaultColor, 255]));
    setTextureParameters(1, 1);

    if (imagePath) {
      const image = new Image();
      image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        setTextureParameters(image.width, image.height);
      };
      image.onerror = () => {
        status.textContent += ` | 텍스처 로딩 실패: ${imagePath}`;
      };
      image.src = imagePath;
    }
    return texture;
  }

  // 바닥 타일링 확인용 체커 텍스처 (64x64, 2의 거듭제곱). 실제 이미지로 교체 예정.
  function createCheckerTexture(size = 64, cells = 8) {
    const pixels = new Uint8Array(size * size * 4);
    const cell = size / cells;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const value = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 200 : 90;
        pixels.set([value, value, value, 255], (y * size + x) * 4);
      }
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    setTextureParameters(size, size);
    return texture;
  }

  try {
    const program = createProgram(vertexShaderSource, fragmentShaderSource);
    gl.useProgram(program);

    const attribs = {
      position: gl.getAttribLocation(program, 'aPosition'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      texCoord: gl.getAttribLocation(program, 'aTexCoord'),
    };

    const uniforms = {};
    [
      'uModelMatrix', 'uNormalMatrix', 'uMvpMatrix', 'uUvScale', 'uTexture',
      'uLightPosition', 'uCameraPosition', 'uLightColor',
      'uKa', 'uKd', 'uKs', 'uShininess',
    ].forEach((name) => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const meshes = {
      cube: createMesh(createCube()),
      sphere: createMesh(createSphere(24, 24)),
    };

    const textures = {
      white: loadTexture(null),
      checker: createCheckerTexture(),
      earth: loadTexture('textures/earth_texture.png', [40, 120, 210]),
      moon: loadTexture('textures/moon_texture.png', [175, 175, 175]),
    };

    // 재질: Phong 계수 + UV 반복 횟수
    const materials = {
      floor: { ka: 0.25, kd: 0.8, ks: 0.05, shininess: 8, uvScale: [8, 8] },
      metal: { ka: 0.15, kd: 0.5, ks: 0.9, shininess: 64, uvScale: [1, 1] },
      matte: { ka: 0.2, kd: 0.9, ks: 0.1, shininess: 8, uvScale: [1, 1] },
      emissive: { ka: 1.0, kd: 0.0, ks: 0.0, shininess: 1, uvScale: [1, 1] }, // 광원 표시용
    };

    // ========================================================================
    // 4. 상태 + 키보드 입력 (누르고 있는 동안 연속 동작)
    // ========================================================================

    const LIGHT_POSITION = [3, 5, 3];
    const initialState = () => ({
      baseYaw: 0,                    // 부모: Y축 회전 (Q/E)
      armAngle: Math.PI / 6,         // 자식: Z축 관절 회전 (W/S)
      camera: { yaw: 0.6, pitch: 0.45, distance: 9 },
    });
    let state = initialState();

    // event.code는 물리 키 위치('KeyQ', 'ArrowLeft')라서 한글 입력 상태나 Shift와 상관없이 같은 값이다.
    // (event.key는 한글 입력 상태에서 'ㅂ'이나 'Process'가 되어 키가 안 먹는다)
    const pressed = new Set();
    window.addEventListener('keydown', (event) => {
      const code = event.code;
      if (code.startsWith('Arrow')) event.preventDefault(); // 페이지 스크롤 방지
      if (code === 'KeyR') state = initialState();
      pressed.add(code);
    });
    window.addEventListener('keyup', (event) => pressed.delete(event.code));
    // 키를 누른 채 창을 벗어나면 keyup이 오지 않아 계속 눌린 상태로 남으므로 비운다.
    window.addEventListener('blur', () => pressed.clear());

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    function updateState(dt) {
      const turn = 1.5 * dt;
      if (pressed.has('KeyQ')) state.baseYaw += turn;
      if (pressed.has('KeyE')) state.baseYaw -= turn;
      if (pressed.has('KeyW')) state.armAngle = clamp(state.armAngle + turn, -1.4, 1.4);
      if (pressed.has('KeyS')) state.armAngle = clamp(state.armAngle - turn, -1.4, 1.4);

      const camera = state.camera;
      if (pressed.has('ArrowLeft')) camera.yaw -= turn;
      if (pressed.has('ArrowRight')) camera.yaw += turn;
      if (pressed.has('ArrowUp')) camera.pitch = clamp(camera.pitch + turn, 0.05, 1.5);
      if (pressed.has('ArrowDown')) camera.pitch = clamp(camera.pitch - turn, 0.05, 1.5);
      if (pressed.has('KeyZ')) camera.distance = clamp(camera.distance - 5 * dt, 3, 25);
      if (pressed.has('KeyX')) camera.distance = clamp(camera.distance + 5 * dt, 3, 25);
    }

    // ========================================================================
    // 5. 그리기
    // ========================================================================

    function bindMesh(mesh) {
      const bindAttrib = (buffer, location, size) => {
        if (location < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      };
      bindAttrib(mesh.position, attribs.position, 3);
      bindAttrib(mesh.normal, attribs.normal, 3);
      bindAttrib(mesh.texCoord, attribs.texCoord, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
    }

    function drawMesh(mesh, modelMatrix, texture, material, viewProjectionMatrix) {
      bindMesh(mesh);
      gl.uniformMatrix4fv(uniforms.uModelMatrix, false, modelMatrix);
      gl.uniformMatrix3fv(uniforms.uNormalMatrix, false, normalMatrix(modelMatrix));
      gl.uniformMatrix4fv(uniforms.uMvpMatrix, false, multiply(viewProjectionMatrix, modelMatrix));
      gl.uniform2fv(uniforms.uUvScale, material.uvScale);
      gl.uniform1f(uniforms.uKa, material.ka);
      gl.uniform1f(uniforms.uKd, material.kd);
      gl.uniform1f(uniforms.uKs, material.ks);
      gl.uniform1f(uniforms.uShininess, material.shininess);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniforms.uTexture, 0);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }

    function drawScene() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.DEPTH_TEST); // 표준 깊이 규약: clearDepth(1.0) + LESS (WebGL 기본값)
      gl.clearColor(0.05, 0.06, 0.1, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // 궤도 카메라: target을 중심으로 yaw/pitch/distance 구면 좌표
      const { yaw, pitch, distance } = state.camera;
      const target = [0, 1, 0];
      const eye = [
        target[0] + distance * Math.cos(pitch) * Math.sin(yaw),
        target[1] + distance * Math.sin(pitch),
        target[2] + distance * Math.cos(pitch) * Math.cos(yaw),
      ];
      const projectionMatrix = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
      const viewProjectionMatrix = multiply(projectionMatrix, lookAt(eye, target, [0, 1, 0]));

      gl.uniform3fv(uniforms.uLightPosition, LIGHT_POSITION);
      gl.uniform3fv(uniforms.uCameraPosition, eye);
      gl.uniform3fv(uniforms.uLightColor, [1, 1, 1]);

      const draw = (mesh, model, texture, material) =>
        drawMesh(mesh, model, texture, material, viewProjectionMatrix);

      // 바닥: 정육면체를 비균등 스케일
      draw(meshes.cube,
        multiplyAll(translation(0, -0.05, 0), scaling(10, 0.05, 10)),
        textures.checker, materials.floor);

      // ---- 계층 구조 예시 (HW1 방식: frame에는 이동/회전만, geometry 복사본에만 scale) ----
      // 1) base frame
      const baseFrame = rotationY(state.baseYaw);
      draw(meshes.cube,
        multiplyAll(baseFrame, translation(0, 0.25, 0), scaling(0.6, 0.25, 0.6)),
        textures.moon, materials.metal);

      // 2) arm frame: base 윗면으로 이동 후 관절 회전 → base 회전을 상속
      const armFrame = multiplyAll(baseFrame, translation(0, 0.5, 0), rotationZ(state.armAngle));
      draw(meshes.cube,
        multiplyAll(armFrame, translation(0, 0.75, 0), scaling(0.12, 0.75, 0.12)),
        textures.white, materials.metal);

      // 3) tip frame: arm 끝 → base와 arm 회전을 모두 상속
      const tipFrame = multiplyAll(armFrame, translation(0, 1.5, 0));
      draw(meshes.sphere,
        multiplyAll(tipFrame, scaling(0.3)),
        textures.earth, materials.matte);

      // 광원 위치 표시
      draw(meshes.sphere,
        multiplyAll(translation(...LIGHT_POSITION), scaling(0.12)),
        textures.white, materials.emissive);
    }

    status.textContent =
      'Q/E: 부모 회전 | W/S: 자식 관절 | 방향키: 카메라 회전 | Z/X: 줌 | R: 초기화';

    let lastMs = performance.now();
    function animate(nowMs) {
      const dt = Math.min((nowMs - lastMs) * 0.001, 0.1);
      lastMs = nowMs;
      updateState(dt);
      drawScene();
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    status.textContent = error.message;
  }
})();
