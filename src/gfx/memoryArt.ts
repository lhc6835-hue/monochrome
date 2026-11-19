/**
 * 기억 조각: 아이가 크레용으로 그린 그림.
 * 회색 연필 선 위에 꽃만 색이 있다. 획 단위로 그려지듯 나타난다.
 */
import { clamp, hash1, TAU } from '../core/math';
import { PETAL_COLORS, STEM } from './flower';
import type { Screen } from './screen';

type Stroke = { pts: [number, number][]; color: string; w: number; fill?: boolean };

function circle(cx: number, cy: number, r: number, n = 18): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU + 0.3;
    const rr = r * (1 + (hash1(cx + i) - 0.5) * 0.12);
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

const GRAY = '#6d6d6a';
const DARK = '#2b2b2a';

function gardenArt(): Stroke[] {
  const S: Stroke[] = [];
  // 땅
  S.push({ pts: [[-420, 190], [-200, 182], [0, 192], [220, 184], [420, 190]], color: GRAY, w: 5 });
  // 키 큰 정원사
  S.push({ pts: circle(-120, -160, 42), color: DARK, w: 5 });
  S.push({ pts: [[-120, -118], [-122, 60]], color: DARK, w: 6 });
  S.push({ pts: [[-122, 60], [-160, 186]], color: DARK, w: 6 });
  S.push({ pts: [[-122, 60], [-84, 186]], color: DARK, w: 6 });
  S.push({ pts: [[-121, -70], [-190, 0], [-176, 40]], color: DARK, w: 6 });
  S.push({ pts: [[-121, -70], [-40, -20], [10, -40]], color: DARK, w: 6 });
  // 물뿌리개
  S.push({ pts: [[0, -50], [44, -50], [44, -12], [0, -12], [0, -50]], color: GRAY, w: 5 });
  S.push({ pts: [[44, -40], [86, -70]], color: GRAY, w: 4 });
  // 물방울
  for (let i = 0; i < 4; i++) S.push({ pts: [[92 + i * 8, -50 + i * 22], [94 + i * 8, -40 + i * 22]], color: '#9fb8d8', w: 4 });
  // 가슴에 꽃잎 (빨강: 그 사람과 나눠 가진 색)
  S.push({ pts: circle(-121, -40, 9, 10), color: PETAL_COLORS[0], w: 5, fill: true });
  // 작은 아이 (손잡기)
  S.push({ pts: circle(-250, 40, 26), color: DARK, w: 5 });
  S.push({ pts: [[-250, 66], [-250, 130]], color: DARK, w: 5 });
  S.push({ pts: [[-250, 130], [-272, 186]], color: DARK, w: 5 });
  S.push({ pts: [[-250, 130], [-228, 186]], color: DARK, w: 5 });
  S.push({ pts: [[-250, 86], [-200, 46], [-178, 40]], color: DARK, w: 5 });
  S.push({ pts: [[-250, 86], [-290, 120]], color: DARK, w: 5 });
  // 아이의 가슴에도 같은 빨간 꽃잎
  S.push({ pts: circle(-250, 92, 7, 8), color: PETAL_COLORS[0], w: 4, fill: true });
  // 꽃밭
  const fx = [60, 130, 200, 270, 340, 110, 240, 380];
  fx.forEach((x, i) => {
    const h = 70 + hash1(i * 3) * 60;
    S.push({ pts: [[x, 188], [x + 4, 188 - h * 0.5], [x, 188 - h]], color: STEM, w: 4 });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      S.push({ pts: circle(x + Math.cos(a) * 13, 188 - h + Math.sin(a) * 13, 10, 8), color: PETAL_COLORS[(i + k) % 7], w: 5, fill: true });
    }
    S.push({ pts: circle(x, 188 - h, 6, 8), color: '#ffe08a', w: 4, fill: true });
  });
  // 해 (회색)
  S.push({ pts: circle(330, -170, 46), color: GRAY, w: 5 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    S.push({ pts: [[330 + Math.cos(a) * 62, -170 + Math.sin(a) * 62], [330 + Math.cos(a) * 86, -170 + Math.sin(a) * 86]], color: GRAY, w: 4 });
  }
  // 나중에 누군가 검게 덧칠한 꽃 하나 (덧칠 아래로 빨간 꽃잎이 비친다)
  S.push({ pts: [[360, 188], [362, 130], [360, 96]], color: STEM, w: 4 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    S.push({ pts: circle(360 + Math.cos(a) * 14, 90 + Math.sin(a) * 14, 11, 8), color: PETAL_COLORS[0], w: 5, fill: true });
  }
  const sc: [number, number][] = [];
  for (let i = 0; i < 16; i++) sc.push([360 + (i % 2 ? 34 : -34) + hash1(i) * 10, 60 + i * 6]);
  S.push({ pts: sc, color: '#111', w: 9 });
  return S;
}

function givingArt(): Stroke[] {
  const S: Stroke[] = [];
  S.push({ pts: [[-430, 190], [-100, 186], [200, 192], [430, 188]], color: GRAY, w: 5 });
  // 정원사 (키가 크다)
  S.push({ pts: circle(-250, -150, 40), color: DARK, w: 5 });
  S.push({ pts: [[-250, -110], [-252, 70]], color: DARK, w: 6 });
  S.push({ pts: [[-252, 70], [-290, 186]], color: DARK, w: 6 });
  S.push({ pts: [[-252, 70], [-214, 186]], color: DARK, w: 6 });
  S.push({ pts: [[-251, -60], [-310, 10]], color: DARK, w: 6 });
  S.push({ pts: [[-251, -60], [-170, -40], [-120, -20]], color: DARK, w: 6 });
  // 손에 든 꽃: 꽃잎이 두 장밖에 남지 않았다
  S.push({ pts: [[-118, -20], [-112, -90]], color: STEM, w: 4 });
  S.push({ pts: circle(-124, -100, 11, 8), color: PETAL_COLORS[0], w: 5, fill: true });
  S.push({ pts: circle(-100, -96, 11, 8), color: PETAL_COLORS[4], w: 5, fill: true });
  // 줄 선 사람들: 울고 있다, 가슴에 꽃잎 하나씩
  for (let i = 0; i < 4; i++) {
    const x = -10 + i * 105;
    const hgt = i === 2 ? 0.7 : 1;
    const top = 186 - 230 * hgt;
    S.push({ pts: circle(x, top + 28 * hgt, 26 * hgt), color: DARK, w: 5 });
    S.push({ pts: [[x, top + 54 * hgt], [x, top + 160 * hgt]], color: DARK, w: 5 });
    S.push({ pts: [[x, top + 160 * hgt], [x - 20, 186]], color: DARK, w: 5 });
    S.push({ pts: [[x, top + 160 * hgt], [x + 20, 186]], color: DARK, w: 5 });
    S.push({ pts: [[x, top + 80 * hgt], [x - 28, top + 130 * hgt]], color: DARK, w: 5 });
    S.push({ pts: [[x, top + 80 * hgt], [x + 28, top + 130 * hgt]], color: DARK, w: 5 });
    S.push({ pts: circle(x, top + 95 * hgt, 7, 8), color: PETAL_COLORS[(i * 2 + 1) % 7], w: 4, fill: true });
    // 눈물
    S.push({ pts: [[x - 8, top + 36 * hgt], [x - 10, top + 52 * hgt]], color: '#8fb3e0', w: 3 });
    S.push({ pts: [[x + 8, top + 36 * hgt], [x + 10, top + 52 * hgt]], color: '#8fb3e0', w: 3 });
  }
  // 뒤쪽의 시든 꽃밭 (회색)
  for (let i = 0; i < 9; i++) {
    const x = -420 + i * 100 + hash1(i) * 30;
    S.push({ pts: [[x, -230], [x + 10, -200], [x + 4, -170]], color: '#a2a29e', w: 3 });
    S.push({ pts: circle(x - 6, -236, 9, 8), color: '#a2a29e', w: 3 });
  }
  return S;
}

function factoryArt(): Stroke[] {
  const S: Stroke[] = [];
  S.push({ pts: [[-440, 190], [440, 190]], color: GRAY, w: 5 });
  // 기계 (네모 상자와 톱니)
  S.push({ pts: [[-60, 190], [-60, -40], [120, -40], [120, 190]], color: DARK, w: 6 });
  S.push({ pts: circle(30, -90, 40, 12), color: DARK, w: 5 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    S.push({ pts: [[30 + Math.cos(a) * 40, -90 + Math.sin(a) * 40], [30 + Math.cos(a) * 56, -90 + Math.sin(a) * 56]], color: DARK, w: 5 });
  }
  // 들어가는 사람들: 제각각의 키, 가슴에 색
  [-330, -250, -170].forEach((x, i) => {
    const h = [1, 0.75, 0.9][i];
    const top = 190 - 220 * h;
    S.push({ pts: circle(x, top + 24, 22 * h + 4), color: DARK, w: 5 });
    S.push({ pts: [[x, top + 50], [x, 190 - 70 * h]], color: DARK, w: 5 });
    S.push({ pts: [[x, 190 - 70 * h], [x - 18, 188]], color: DARK, w: 5 });
    S.push({ pts: [[x, 190 - 70 * h], [x + 22, 188]], color: DARK, w: 5 });
    S.push({ pts: [[x, top + 80], [x + 30, top + 110]], color: DARK, w: 5 });
    S.push({ pts: circle(x, top + 90, 7, 8), color: PETAL_COLORS[(i * 3) % 7], w: 4, fill: true });
  });
  // 나오는 아이콘들: 똑같은 키, 색 없음, 차렷 자세
  [200, 270, 340, 410].forEach((x) => {
    S.push({ pts: circle(x, 46, 18), color: GRAY, w: 5 });
    S.push({ pts: [[x - 22, 72], [x + 22, 72], [x + 22, 188], [x - 22, 188], [x - 22, 72]], color: GRAY, w: 5 });
  });
  // 문 밖의 정원사: 꽃잎이 하나도 없는 줄기만 들고 있다
  S.push({ pts: [[-400, 40], [-200, 40]], color: GRAY, w: 4 });
  S.push({ pts: circle(-300, -210, 30), color: DARK, w: 5 });
  S.push({ pts: [[-300, -180], [-300, -60]], color: DARK, w: 5 });
  S.push({ pts: [[-300, -60], [-326, 40]], color: DARK, w: 5 });
  S.push({ pts: [[-300, -60], [-274, 40]], color: DARK, w: 5 });
  S.push({ pts: [[-300, -130], [-250, -170], [-246, -230]], color: DARK, w: 5 });
  S.push({ pts: [[-246, -230], [-240, -270]], color: STEM, w: 4 });
  S.push({ pts: [[-312, -206], [-314, -190]], color: '#8fb3e0', w: 3 });
  return S;
}

function stationArt(): Stroke[] {
  const S: Stroke[] = [];
  // 승강장과 선로
  S.push({ pts: [[-440, 120], [-120, 120], [-120, 190]], color: GRAY, w: 5 });
  S.push({ pts: [[-440, 190], [440, 190]], color: GRAY, w: 5 });
  // 떠나는 기차: 창문마다 사람, 가슴에 색
  S.push({ pts: [[-60, 170], [-60, 0], [420, 0], [420, 170], [-60, 170]], color: DARK, w: 6 });
  for (let i = 0; i < 4; i++) {
    const x = -30 + i * 112;
    S.push({ pts: [[x, 30], [x + 80, 30], [x + 80, 100], [x, 100], [x, 30]], color: DARK, w: 4 });
    S.push({ pts: circle(x + 40, 54, 13, 10), color: DARK, w: 4 });
    S.push({ pts: circle(x + 40, 86, 6, 8), color: PETAL_COLORS[(i * 2 + 2) % 7], w: 4, fill: true });
  }
  S.push({ pts: circle(20, 180, 14, 10), color: DARK, w: 5 });
  S.push({ pts: circle(330, 180, 14, 10), color: DARK, w: 5 });
  // 연기
  S.push({ pts: [[400, -10], [420, -60], [400, -110], [430, -160]], color: GRAY, w: 6 });
  // 승강장에 남은 정원사: 손을 흔든다, 꽃 없는 줄기
  S.push({ pts: circle(-300, -90, 30), color: DARK, w: 5 });
  S.push({ pts: [[-300, -60], [-300, 40]], color: DARK, w: 5 });
  S.push({ pts: [[-300, 40], [-326, 118]], color: DARK, w: 5 });
  S.push({ pts: [[-300, 40], [-274, 118]], color: DARK, w: 5 });
  S.push({ pts: [[-300, -30], [-250, -80], [-236, -140]], color: DARK, w: 5 });
  S.push({ pts: [[-244, -150], [-226, -130]], color: DARK, w: 3 });
  S.push({ pts: [[-300, -30], [-340, 20]], color: DARK, w: 5 });
  S.push({ pts: [[-340, 20], [-344, -20]], color: STEM, w: 4 });
  S.push({ pts: [[-312, -86], [-314, -70]], color: '#8fb3e0', w: 3 });
  return S;
}

function personAt(S: Stroke[], x: number, base: number, h: number, color = DARK, arm?: [number, number][]) {
  const top = base - 230 * h;
  S.push({ pts: circle(x, top + 26 * h, 24 * h + 4), color, w: 5 });
  S.push({ pts: [[x, top + 52 * h], [x, base - 70 * h]], color, w: 5 });
  S.push({ pts: [[x, base - 70 * h], [x - 20, base - 2]], color, w: 5 });
  S.push({ pts: [[x, base - 70 * h], [x + 20, base - 2]], color, w: 5 });
  if (arm) S.push({ pts: arm, color, w: 5 });
}

/** 함께: 정원사와 그의 사람이 꽃밭에서 손을 잡고 있다 */
function togetherArt(): Stroke[] {
  const S: Stroke[] = [];
  S.push({ pts: [[-440, 190], [440, 190]], color: GRAY, w: 5 });
  personAt(S, -60, 190, 1.1, DARK, [[-60, -20], [0, 20], [40, -10]]);
  personAt(S, 60, 190, 1.0, DARK, [[60, -10], [40, -10]]);
  // 서로의 가슴에 같은 색 꽃잎
  S.push({ pts: circle(-60, -40, 8, 8), color: PETAL_COLORS[0], w: 4, fill: true });
  S.push({ pts: circle(60, -30, 8, 8), color: PETAL_COLORS[0], w: 4, fill: true });
  // 하트 모양 꽃밭
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const hx = 16 * Math.pow(Math.sin(a), 3);
    const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    const x = hx * 9,
      y = -170 + hy * 7;
    S.push({ pts: circle(x, y, 9, 8), color: PETAL_COLORS[i % 7], w: 4, fill: true });
  }
  for (let i = 0; i < 10; i++) {
    const x = -400 + i * 90 + (i > 4 ? 140 : 0);
    if (Math.abs(x) < 140) continue;
    S.push({ pts: [[x, 190], [x, 130]], color: STEM, w: 4 });
    S.push({ pts: circle(x, 124, 12, 8), color: PETAL_COLORS[(i + 3) % 7], w: 4, fill: true });
  }
  return S;
}

/** 홀로: 시든 꽃밭, 비어 있는 자리, 마지막 한 송이를 든 정원사 */
function aloneArt(): Stroke[] {
  const S: Stroke[] = [];
  S.push({ pts: [[-440, 190], [440, 190]], color: GRAY, w: 5 });
  // 그 사람이 서 있던 자리: 점선 윤곽만
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU;
    S.push({ pts: [[60 + Math.cos(a) * 26, -12 + Math.sin(a) * 26], [60 + Math.cos(a + 0.2) * 26, -12 + Math.sin(a + 0.2) * 26]], color: '#9a9a96', w: 4 });
  }
  for (let y = 20; y < 180; y += 26) S.push({ pts: [[60, y], [60, y + 12]], color: '#9a9a96', w: 4 });
  // 빈자리의 가슴에, 바랜 빨간 점 하나
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    S.push({ pts: [[60 + Math.cos(a) * 8, 52 + Math.sin(a) * 8], [60 + Math.cos(a + 0.4) * 8, 52 + Math.sin(a + 0.4) * 8]], color: '#d8a3a7', w: 3 });
  }
  // 정원사: 무릎 꿇고 마지막 꽃을 든다
  S.push({ pts: circle(-120, -10, 30), color: DARK, w: 5 });
  S.push({ pts: [[-120, 20], [-110, 120]], color: DARK, w: 5 });
  S.push({ pts: [[-110, 120], [-60, 130], [-60, 188]], color: DARK, w: 5 });
  S.push({ pts: [[-110, 120], [-150, 188]], color: DARK, w: 5 });
  S.push({ pts: [[-116, 50], [-60, 40], [-30, 20]], color: DARK, w: 5 });
  S.push({ pts: [[-28, 20], [-24, -40]], color: STEM, w: 4 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    S.push({ pts: circle(-24 + Math.cos(a) * 12, -52 + Math.sin(a) * 12, 8, 8), color: PETAL_COLORS[i], w: 4, fill: true });
  }
  S.push({ pts: [[-132, -6], [-134, 10]], color: '#8fb3e0', w: 3 });
  S.push({ pts: [[-136, 18], [-137, 30]], color: '#8fb3e0', w: 3 });
  // 시든 꽃밭
  for (let i = 0; i < 9; i++) {
    const x = 160 + i * 32;
    S.push({ pts: [[x, 190], [x + 6, 150], [x + 16, 140]], color: '#a2a29e', w: 3 });
    S.push({ pts: circle(x + 20, 140, 7, 6), color: '#a2a29e', w: 3 });
  }
  return S;
}

/** 숨바꼭질: 나무에 얼굴을 묻고 세는 정원사, 덤불·나무 뒤에 숨어 웃는 아이들 (가슴에 꽃잎) */
function hideArt(): Stroke[] {
  const S: Stroke[] = [];
  S.push({ pts: [[-440, 190], [440, 190]], color: GRAY, w: 5 });
  // 큰 나무
  S.push({ pts: [[300, 190], [296, 20], [300, -60]], color: DARK, w: 14 });
  S.push({ pts: circle(300, -130, 110, 22), color: GRAY, w: 6 });
  S.push({ pts: circle(240, -90, 60, 14), color: GRAY, w: 5 });
  // 정원사: 나무에 이마를 대고 팔로 눈을 가린다
  S.push({ pts: circle(250, -40, 28), color: DARK, w: 5 });
  S.push({ pts: [[244, -12], [226, 110]], color: DARK, w: 6 });
  S.push({ pts: [[226, 110], [206, 188]], color: DARK, w: 6 });
  S.push({ pts: [[226, 110], [244, 188]], color: DARK, w: 6 });
  S.push({ pts: [[240, 10], [270, -10], [262, -40]], color: DARK, w: 6 });
  S.push({ pts: circle(232, 30, 8, 8), color: PETAL_COLORS[0], w: 4, fill: true });
  // 숫자 세는 말풍선 (회색 점 열 개)
  for (let i = 0; i < 10; i++) S.push({ pts: circle(120 - i * 22, -150 - Math.sin(i * 0.6) * 18, 5, 6), color: '#8d8d89', w: 3, fill: true });
  // 덤불 뒤 아이 둘
  S.push({ pts: circle(-120, 150, 70, 16), color: GRAY, w: 5 });
  personAt(S, -150, 190, 0.55, DARK, [[-150, 110], [-120, 90]]);
  S.push({ pts: circle(-150, 120, 6, 6), color: PETAL_COLORS[0], w: 3, fill: true });
  personAt(S, -90, 190, 0.5, DARK, [[-90, 120], [-110, 96]]);
  S.push({ pts: circle(-90, 128, 6, 6), color: PETAL_COLORS[5], w: 3, fill: true });
  // 작은 나무 뒤 아이 하나 (얼굴만 빼꼼)
  S.push({ pts: [[-330, 190], [-332, 0]], color: DARK, w: 12 });
  S.push({ pts: circle(-332, -60, 70, 16), color: GRAY, w: 5 });
  S.push({ pts: circle(-300, 60, 18), color: DARK, w: 4 });
  S.push({ pts: circle(-300, 92, 5, 6), color: PETAL_COLORS[3], w: 3, fill: true });
  // 웃음 (짧은 획)
  for (let i = 0; i < 3; i++) S.push({ pts: [[-60 + i * 10, 60 - i * 8], [-54 + i * 10, 52 - i * 8]], color: '#9a9a96', w: 3 });
  return S;
}

/** 첫 번째 눈: 반쯤 하얗게 빈 정원사가 보도블록 틈에 무릎 꿇고 꽃씨 하나를 떨어뜨린다 (오프닝의 그 자리) */
function firstEyeArt(): Stroke[] {
  const S: Stroke[] = [];
  // 보도블록
  S.push({ pts: [[-440, 190], [440, 190]], color: GRAY, w: 5 });
  for (let x = -420; x < 440; x += 120) S.push({ pts: [[x, 190], [x, 230]], color: '#a3a39f', w: 3 });
  S.push({ pts: [[-440, 230], [440, 230]], color: '#a3a39f', w: 3 });
  // 틈 (오프닝과 같은 모양)
  S.push({ pts: [[60, 190], [72, 200], [66, 210], [82, 222], [78, 230]], color: DARK, w: 3 });
  // 정원사: 몸의 오른쪽 절반은 이미 비어 점선만 남았다
  const ghost = '#b4b4b0';
  S.push({ pts: circle(-40, -70, 34), color: DARK, w: 5 });
  for (let k = 0; k < 12; k++) {
    const a = -Math.PI / 2 + (k / 12) * Math.PI;
    S.push({ pts: [[-40 + Math.cos(a) * 36, -70 + Math.sin(a) * 36], [-40 + Math.cos(a + 0.12) * 36, -70 + Math.sin(a + 0.12) * 36]], color: ghost, w: 4 });
  }
  S.push({ pts: [[-44, -36], [-56, 70]], color: DARK, w: 6 });
  for (let y = -30; y < 70; y += 22) S.push({ pts: [[-26, y], [-28, y + 10]], color: ghost, w: 4 });
  // 무릎 꿇은 다리
  S.push({ pts: [[-56, 70], [-10, 96], [-14, 188]], color: DARK, w: 6 });
  S.push({ pts: [[-56, 70], [-96, 188]], color: ghost, w: 5 });
  // 틈으로 뻗은 손, 떨어지는 꽃씨
  S.push({ pts: [[-46, 0], [20, 60], [54, 130]], color: DARK, w: 6 });
  S.push({ pts: circle(64, 160, 6, 8), color: PETAL_COLORS[0], w: 4, fill: true });
  S.push({ pts: [[60, 140], [62, 148]], color: '#c9c9c5', w: 2 });
  // 가슴에 남은 마지막 꽃잎 하나 (흐릿하게)
  S.push({ pts: circle(-44, 8, 7, 8), color: PETAL_COLORS[0], w: 3 });
  // 틈 바로 옆에 굳어 선 사람 하나 — 가슴에 바랜 빨간 점
  personAt(S, 150, 190, 0.95, '#6d6d6a');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    S.push({ pts: [[150 + Math.cos(a) * 7, 62 + Math.sin(a) * 7], [150 + Math.cos(a + 0.4) * 7, 62 + Math.sin(a + 0.4) * 7]], color: '#d8a3a7', w: 3 });
  }
  // 멀리 굳은 사람들 (아이콘)
  for (let i = 0; i < 4; i++) personAt(S, 280 + i * 46, 190, 0.45, '#8d8d89');
  return S;
}

/**
 * 그림 아래의 손글씨 한 줄 (정원사의 목소리). 찾는 순서는 섞여 있지만, 모아 읽으면 한 사람의 이야기가 된다.
 * 마지막 '첫 번째 눈'만 크레용이 아니라 연필로, 또박또박 쓰였다.
 */
const CAPTIONS: Record<string, string> = {
  garden: '우리 정원.',
  giving: '아픈 사람마다, 한 장씩.',
  factory: '다들, 아프지 않은 쪽을 골랐다.',
  station: '모두 떠났다. 나는 여기서 기다린다.',
  together: '너와 나, 같은 색.',
  alone: '네가 제일 먼저 굳었다.',
  hide: '꼭꼭 숨어도, 내가 꼭 찾을게.',
  firsteye: '이번엔, 네가 나를 찾아 줘.',
};
const CAP_START = 3.6;
const CAP_CPS = 9;
/** 이 그림을 닫아도 되는 때 (손글씨까지 다 쓰인 뒤) */
export function memoryReadyAt(art: string) {
  const n = [...(CAPTIONS[art] ?? '')].length;
  return CAP_START + n / CAP_CPS + 0.4;
}

const ARTS: Record<string, () => Stroke[]> = { garden: gardenArt, giving: givingArt, factory: factoryArt, station: stationArt, together: togetherArt, alone: aloneArt, hide: hideArt, firsteye: firstEyeArt };
const cache = new Map<string, Stroke[]>();

export function drawMemory(s: Screen, art: string, t: number, alpha: number) {
  let strokes = cache.get(art);
  if (!strokes) {
    strokes = (ARTS[art] ?? gardenArt)();
    cache.set(art, strokes);
  }
  const ctx = s.ctx;
  s.base(ctx);
  ctx.save();
  ctx.globalAlpha = alpha * 0.82;
  ctx.fillStyle = '#000';
  ctx.fillRect(-10, -10, s.W + 20, s.H + 20);
  ctx.globalAlpha = alpha;
  const sc = Math.min(s.W / 1200, s.H / 800) * 1.0;
  ctx.translate(s.W / 2, s.H / 2 - 20);
  ctx.scale(sc, sc);
  ctx.rotate(-0.015);
  // 종이
  ctx.fillStyle = '#f1efe8';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 30;
  ctx.fillRect(-470, -300, 940, 560);
  ctx.shadowBlur = 0;
  // 종이 결
  ctx.globalAlpha = alpha * 0.05;
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = '#000';
    ctx.fillRect(-470 + hash1(i) * 940, -300 + hash1(i * 7) * 560, 1 + hash1(i * 3) * 80, 1);
  }
  ctx.globalAlpha = alpha;
  // 크레용 획
  const per = 3.2 / strokes.length;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokes.forEach((st, i) => {
    const k = clamp((t - 0.3 - i * per) / 0.35);
    if (k <= 0) return;
    const n = Math.max(2, Math.ceil(st.pts.length * k));
    for (let pass = 0; pass < 3; pass++) {
      ctx.globalAlpha = alpha * (pass === 0 ? 0.85 : 0.35);
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.w * (pass === 0 ? 1 : 0.6);
      ctx.beginPath();
      for (let j = 0; j < n; j++) {
        const [x, y] = st.pts[j];
        const jx = (hash1(i * 31 + j * 7 + pass * 13) - 0.5) * 3;
        const jy = (hash1(i * 17 + j * 3 + pass * 29) - 0.5) * 3;
        if (j === 0) ctx.moveTo(x + jx, y + jy);
        else ctx.lineTo(x + jx, y + jy);
      }
      ctx.stroke();
      if (st.fill && k >= 1 && pass === 0) {
        ctx.fillStyle = st.color;
        ctx.globalAlpha = alpha * 0.75;
        ctx.fill();
      }
    }
  });
  // 손글씨: 한 글자씩 꾹꾹 눌러 쓴다 (크레용은 삐뚤빼뚤, 연필은 또박또박)
  const cap = CAPTIONS[art];
  if (cap && t > CAP_START) {
    const pencil = art === 'firsteye';
    const chars = [...cap];
    const shown = (t - CAP_START) * CAP_CPS;
    ctx.font = `${pencil ? 500 : 700} ${pencil ? 26 : 30}px "Nanum Pen Script", "Gaegu", "Nanum Brush Script", "Noto Serif KR", "AppleMyungjo", "Batang", serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    let x = -430;
    const y = pencil ? 252 : 248;
    chars.forEach((ch, i) => {
      const k = clamp(shown - i);
      const w = ctx.measureText(ch).width;
      if (k > 0) {
        ctx.save();
        ctx.translate(x + w / 2, y + (pencil ? 0 : (hash1(i * 5.3) - 0.5) * 5));
        ctx.rotate(pencil ? 0 : (hash1(i * 2.7) - 0.5) * 0.14);
        ctx.globalAlpha = alpha * k * (pencil ? 0.7 : 0.9);
        ctx.fillStyle = pencil ? '#6a6a66' : '#3b3a38';
        ctx.fillText(ch, -w / 2, 0);
        if (!pencil) {
          ctx.globalAlpha = alpha * k * 0.3;
          ctx.fillText(ch, -w / 2 + 1, 1);
        }
        ctx.restore();
      }
      x += w + (pencil ? 1 : 2);
    });
  }
  ctx.restore();
  // 닫기 안내
  const ready = memoryReadyAt(art);
  if (t > ready) {
    ctx.save();
    ctx.globalAlpha = alpha * clamp((t - ready) / 0.6) * 0.7;
    ctx.fillStyle = '#bbb';
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    ctx.font = `400 ${Math.round(20 * s.ui)}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(touch ? '화면을 눌러 닫기' : '아무 키나 눌러 닫기', s.W / 2, s.H - 50 * s.ui);
    ctx.restore();
  }
}
