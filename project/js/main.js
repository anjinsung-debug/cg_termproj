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
      // [추가] 선수용 단색 텍스처 (1x1). 실제 유니폼 이미지는 홍채운 텍스처 작업에서 교체.
      jersey: loadTexture(null, [0, 76, 84]),
      pants: loadTexture(null, [225, 225, 215]),
      helmet: loadTexture(null, [160, 165, 170]),
      skin: loadTexture(null, [120, 80, 55]),
      ball: loadTexture(null, [110, 55, 25]),
      awayJersey: loadTexture(null, [235, 235, 235]),
      awayPants: loadTexture(null, [30, 30, 35]),
      awayHelmet: loadTexture(null, [25, 25, 30]),
    };

    // 재질: Phong 계수 + UV 반복 횟수
    const materials = {
      floor: { ka: 0.25, kd: 0.8, ks: 0.05, shininess: 8, uvScale: [24, 24] },
      metal: { ka: 0.15, kd: 0.5, ks: 0.9, shininess: 64, uvScale: [1, 1] },
      matte: { ka: 0.2, kd: 0.9, ks: 0.1, shininess: 8, uvScale: [1, 1] },
      emissive: { ka: 1.0, kd: 0.0, ks: 0.0, shininess: 1, uvScale: [1, 1] }, // 광원 표시용
    };

    // [추가] 선수 부위(look) → 텍스처 + 재질. 헬멧만 금속성 하이라이트.
    const homeLooks = {
      jersey: { texture: textures.jersey, material: materials.matte },
      pants: { texture: textures.pants, material: materials.matte },
      helmet: { texture: textures.helmet, material: materials.metal },
      skin: { texture: textures.skin, material: materials.matte },
      ball: { texture: textures.ball, material: materials.matte },
    };
    const awayLooks = {
      ...homeLooks,
      jersey: { texture: textures.awayJersey, material: materials.matte },
      pants: { texture: textures.awayPants, material: materials.matte },
      helmet: { texture: textures.awayHelmet, material: materials.metal },
    };
    // [추가] 장면의 선수들: animation.js 트랙 이름 → 유니폼. 공은 러닝백만 든다.
    const PLAYERS = [
      { track: 'runner', looks: homeLooks, hasBall: true },
      { track: 'defender1', looks: awayLooks, hasBall: false },
      { track: 'defender2', looks: awayLooks, hasBall: false },
    ];

    // ========================================================================
    // 4. 상태 + 입력
    //    키보드: Space 재생/정지, ←/→ 한 프레임 이동, R 처음부터
    //    마우스: 드래그로 카메라 궤도 회전, 휠로 줌
    // ========================================================================

    const LIGHT_POSITION = [0, 12, 8];
    const FRAME_STEP = 1 / 30;                // ←/→ 한 번에 이동하는 시간 (30fps 기준 1프레임)
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const initialState = () => ({
      time: 0,                                // 장면 시간 (0 ~ endTime())
      playing: true,
      cameraMode: 'broadcast',                // camera.js CAMERA_MODES (1/2/3키)
      orbit: { yaw: 0, pitch: 0, zoom: 1 },   // 중계 시점에 마우스로 더한 회전·줌
      celebration: 'spike',                   // [추가] 플레이가 끝나면 자동으로 이어지는 세레모니 (Q/W/E로 변경)
    });
    let state = initialState();
    let dragging = false;

    // [추가] 플레이(3초) + 세레모니 길이
    const endTime = () => SCENE_DURATION + CELEBRATIONS[state.celebration].duration;
    const CELEBRATION_KEYS = { KeyQ: 'spike', KeyW: 'jump', KeyE: 'dance' };

    // event.code는 물리 키 위치('Space', 'ArrowLeft')라서 한글 입력 상태나 Shift와 상관없이 같은 값이다.
    // (event.key는 한글 입력 상태에서 'ㅂ'이나 'Process'가 되어 키가 안 먹는다)
    window.addEventListener('keydown', (event) => {
      const code = event.code;
      if (code === 'Space' || code.startsWith('Arrow')) event.preventDefault(); // 페이지 스크롤 방지
      if (code === 'Space') {
        if (state.time >= endTime()) state.time = 0;  // 끝에서 누르면 처음부터 다시
        state.playing = !state.playing;
      }
      if (code === 'ArrowLeft' || code === 'ArrowRight') {
        state.playing = false;                // 프레임 이동은 정지 상태에서
        const step = code === 'ArrowRight' ? FRAME_STEP : -FRAME_STEP;
        state.time = clamp(state.time + step, 0, endTime());
      }
      if (code === 'KeyR') {
        state = { ...initialState(), cameraMode: state.cameraMode, celebration: state.celebration };
      }
      // [추가] 세레모니 선택: 플레이 중이면 끝난 뒤 그 동작으로, 이미 세레모니 중이면 바로 바꿔서 다시 시작
      if (CELEBRATION_KEYS[code]) {
        state.celebration = CELEBRATION_KEYS[code];
        if (state.time > SCENE_DURATION) {
          state.time = SCENE_DURATION;
          state.playing = true;
        }
      }
      // [추가] 1/2/3: 카메라 시점 전환 (숫자패드도 허용)
      const digit = code.match(/^(?:Digit|Numpad)([1-3])$/);
      if (digit) state.cameraMode = CAMERA_MODES[Number(digit[1]) - 1];
    });

    // [추가] 중계 시점: 마우스 드래그 궤도 회전 + 휠 줌. 놓으면 중계 위치로 서서히 돌아간다.
    canvas.addEventListener('mousedown', () => { dragging = true; });
    window.addEventListener('mouseup', () => { dragging = false; });
    canvas.addEventListener('mousemove', (event) => {
      if (!dragging || state.cameraMode !== 'broadcast') return;
      state.orbit.yaw -= event.movementX * 0.01;
      state.orbit.pitch += event.movementY * 0.01;
    });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      state.orbit.zoom = clamp(state.orbit.zoom * (1 + event.deltaY * 0.001), 0.3, 2);
    }, { passive: false });

    function updateState(dt) {
      if (!dragging) {
        const back = Math.exp(-3 * dt);       // 프레임 속도와 무관하게 일정한 비율로 복귀
        state.orbit.yaw *= back;
        state.orbit.pitch *= back;
      }
      if (!state.playing) return;
      state.time = Math.min(state.time + dt, endTime());
      if (state.time >= endTime()) state.playing = false;  // 플레이(또는 세레모니) 끝에서 멈춤
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

      const scene = sampleScene(state.time, state.celebration);
      const framesOf = (track) => computeFrames(PLAYER_NODES, track.pose, track.rootMatrix);
      const runnerFrames = runnerFramesAt(state.time, state.celebration);  // 스파이크 후 공 포함

      // ---- [추가] 카메라 (camera.js). 시점마다 View 행렬·화각·숨길 부위가 다르다 ----
      let camera;
      if (state.cameraMode === 'firstPerson') {
        camera = firstPersonCamera(runnerFrames.head);
      } else if (state.cameraMode === 'ball') {
        const dt = 0.05;  // 공 진행 방향을 구할 앞뒤 시간 간격
        const ballAt = (t) => {
          const frame = runnerFramesAt(t, state.celebration).ball;
          return [frame[12], frame[13], frame[14]];
        };
        const root = scene.runner.rootMatrix;
        camera = ballCamera(ballAt(state.time - dt), ballAt(state.time), ballAt(state.time + dt),
          [root[8], root[9], root[10]]);
      } else {
        camera = broadcastCamera(scene.runner.pos, state.time, state.orbit);
      }
      const eye = camera.eye;
      const projectionMatrix = perspective(camera.fov, canvas.width / canvas.height, camera.near, 300);
      const viewProjectionMatrix = multiply(projectionMatrix, camera.view);

      gl.uniform3fv(uniforms.uLightPosition, LIGHT_POSITION);
      gl.uniform3fv(uniforms.uCameraPosition, eye);
      gl.uniform3fv(uniforms.uLightColor, [1, 1, 1]);

      const draw = (mesh, model, texture, material) =>
        drawMesh(mesh, model, texture, material, viewProjectionMatrix);

      // 바닥: 정육면체를 비균등 스케일 (임시. 실제 필드는 홍채운 작업에서 교체)
      draw(meshes.cube,
        multiplyAll(translation(0, -0.05, 8), scaling(60, 0.05, 60)),
        textures.checker, materials.floor);

      // ---- [추가] 선수 관절 트리 (player.js) × 키프레임 (animation.js) ----
      for (const player of PLAYERS) {
        const isRunner = player.track === 'runner';
        const frames = isRunner ? runnerFrames : framesOf(scene[player.track]);
        for (const node of PLAYER_NODES) {
          if (node.name === 'ball' && !player.hasBall) continue;
          if (isRunner && camera.hide.includes(node.name)) continue;  // 카메라가 들어가 있는 부위
          const look = player.looks[node.shape.look];
          draw(meshes[node.shape.mesh], shapeMatrix(frames[node.name], node.shape),
            look.texture, look.material);
        }
      }

      // 광원 위치 표시
      draw(meshes.sphere,
        multiplyAll(translation(...LIGHT_POSITION), scaling(0.12)),
        textures.white, materials.emissive);
    }

    const HELP = 'Space: 재생/정지 | ←/→: 프레임 이동 | R: 처음부터 | 1/2/3: 시점 | 드래그·휠: 중계 카메라 회전·줌\n'
      + 'Q/W/E: 세레모니 선택(스파이크/점프/댄스) — 플레이가 끝나면 자동으로 이어짐';

    let lastMs = performance.now();
    function animate(nowMs) {
      const dt = Math.min((nowMs - lastMs) * 0.001, 0.1);
      lastMs = nowMs;
      updateState(dt);
      drawScene();
      const celebration = `${CELEBRATIONS[state.celebration].label}`
        + (state.time > SCENE_DURATION ? ' 재생 중' : ' (플레이 끝나면 자동 시작)');
      status.textContent = `${HELP}\n${state.playing ? '▶' : '⏸'} ${state.time.toFixed(2)}s / ${endTime().toFixed(1)}s`
        + ` | 시점: ${CAMERA_LABELS[state.cameraMode]} | 세레모니: ${celebration}`;
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    status.textContent = error.message;
  }
})();
