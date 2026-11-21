# CG Term Project

WebGL 1 기반 인터랙티브 3D 프로그램 (Three.js 미사용). HW1·HW2 코드를 기반으로 함.

## 실행 방법

이 폴더에서 로컬 서버를 실행한 뒤 브라우저에서 `http://localhost:8000` 접속 (텍스처 로딩 때문에 파일을 직접 열면 안 됨).

```bash
python -m http.server 8000
```

## 조작 키

| 키 | 동작 |
|---|---|
| Space | 재생 / 정지 (끝에서 누르면 처음부터) |
| ← / → | 한 프레임(1/30초) 뒤로 / 앞으로 |
| R | 처음부터 |
| 1 / 2 / 3 | 시점: 중계 / 러닝백 1인칭 / 공 시점 |
| 마우스 드래그 | 중계 카메라 회전 (놓으면 제자리로) |
| 마우스 휠 | 중계 카메라 줌 |

## 파일 구성

- `js/matrix.js`: HW2 제공 행렬 함수 + 추가(`rotationX`, `rotationZ`, 비균등 `scaling`, `multiplyAll`, `normalMatrix`, `inverse`)
- `js/geometry.js`: 구(HW2 Task 1), 정육면체(HW1 정육면체 + 법선/UV)
- `js/player.js`: 선수 관절 트리 (HW1 로봇 팔 계층 구조를 노드 배열로 일반화). 단위 1 = 1야드
- `js/animation.js`: 하이라이트 장면 키프레임(러닝백·수비수 2명)과 보간 재생. HW2 Task 3 `calculateSceneState(time)` 방식
- `js/camera.js`: 시점 3종 (HW2 cameraMode 기반). 중계는 `lookAt`, 1인칭은 `inverse(머리 frame)`, 공 시점은 공 진행 방향
- `tests/check.js`: 역행렬·관절 트리·키프레임 보간·카메라 자가 점검. `node project/tests/check.js`

좌표: 1 = 1야드, z = 필드 길이(러닝백 진행) 방향, x = 필드 폭 방향, y = 위.
- `js/main.js`: WebGL 초기화, Phong 셰이더, 텍스처, 카메라, 키 입력, 장면

## 외부 자료

- `textures/earth_texture.png`, `textures/moon_texture.png`: HW2 제공 텍스처
