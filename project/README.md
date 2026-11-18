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
| Q / E | 부모 객체 회전 |
| W / S | 자식 관절 회전 |
| 방향키 | 카메라 회전 |
| Z / X | 카메라 줌 인/아웃 |
| R | 초기화 |

## 파일 구성

- `js/matrix.js`: HW2 제공 행렬 함수 + 추가(`rotationX`, `rotationZ`, 비균등 `scaling`, `multiplyAll`, `normalMatrix`)
- `js/geometry.js`: 구(HW2 Task 1), 정육면체(HW1 정육면체 + 법선/UV)
- `js/main.js`: WebGL 초기화, Phong 셰이더, 텍스처, 카메라, 키 입력, 장면

## 외부 자료

- `textures/earth_texture.png`, `textures/moon_texture.png`: HW2 제공 텍스처
