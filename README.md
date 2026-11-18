# THE MONOCHROME (더 모노크롬)

모든 것이 검은 픽토그램으로 굳어버린 흑백의 세계. 보도블록 틈에 핀 단 하나의 색, 꽃 한 송이.
꽃잎을 나눠 이웃을 깨우며 꽃밭을 찾아 떠나는 횡스크롤 스토리 게임.

## 실행
```bash
npm install
npm run dev      # 개발 서버
npm run build    # dist/ 에 배포용 빌드
npm run build:single   # dist/the-monochrome.html 한 파일 (효과음·글꼴 포함, 더블클릭으로 실행)
```

## 조작
| 동작 | 키보드 | 터치 |
|---|---|---|
| 이동 | ← → / A D | ◀ ▶ |
| 점프 | Space / ↑ / W / Z | 점프 |
| 굳기 (서서 길게) · 미끄러지기 (달리며) | ↓ / S | 굳기 |
| 상호작용 · 꽃잎 건네기(길게) · 상자 잡기(누른 채) | E / X / Shift | 행동 |
| 일시정지 | Esc / P | II |

행동·굳기·점프·이동 키는 **설정 → 조작 키**에서 원하는 키로 바꿀 수 있습니다. (Esc, Enter, Tab, P, Backspace 는 메뉴용이라 쓸 수 없음)

설계 문서: [`docs/DESIGN.md`](docs/DESIGN.md) · 에셋 출처: [`CREDITS.md`](CREDITS.md)
