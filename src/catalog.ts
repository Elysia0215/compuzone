/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from "./types";

export const PRODUCT_CATALOG: Product[] = [
  {
    id: "gpu-rtx-5060",
    name: "MSI GeForce RTX 5060 VENTUS 2X OC 8GB",
    category: "GPU",
    price: 450000,
    specs: {
      gpu: "RTX 5060 (8GB)",
      power: "Recommends 550W+",
    },
    imageUrl: "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=600&q=80",
    description: "차세대 보급형 그래픽카드로, DLSS 4 지원과 뛰어난 전력 효율성을 자랑하는 RTX 50 시리즈의 최신 보급기입니다.",
    pros: [
      "최신 DLSS 4 프레임 생성 지원으로 비약적인 프레임 상승",
      "낮은 소비전력(TDP 115W)으로 파워 서플라이 부담 최소화",
      "FHD 해상도 게임 환경에서 풀옵션 상시 유지 가능"
    ],
    cons: [
      "VRAM이 8GB로 제한되어 4K 고해상도 그래픽 작업이나 패키지 게임 최상옵에서는 아쉬움",
      "이전 세대 4060 대비 비약적인 스펙 향상보다는 전력 소모 개선에 주안점"
    ],
    recommendedUsers: [
      "리그 오브 레전드, 발로란트, 배틀그라운드를 쾌적하게 즐기고 싶은 캐주얼/FPS 유저",
      "가성비 있게 전기세 걱정 없는 최신 사양 PC를 맞추고자 하는 알뜰 구매자"
    ],
    stockStatus: "in_stock"
  },
  {
    id: "gpu-rtx-4070s",
    name: "ASUS ROG Strix GeForce RTX 4070 SUPER O12G",
    category: "GPU",
    price: 950000,
    specs: {
      gpu: "RTX 4070 SUPER (12GB)",
      power: "Recommends 700W+",
    },
    imageUrl: "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=600&q=80",
    description: "QHD 고주사율 게이밍을 지배하는 고성능 그래픽카드입니다. 화려한 RGB 감성과 극한의 쿨링 솔루션이 적용된 프리미엄 모델입니다.",
    pros: [
      "QHD 환경에서 대부분의 스팀 패키지 게임 100fps 이상 안정적 구동",
      "12GB 고용량 VRAM 탑재로 고용량 텍스처 작업 및 영상 편집 원활",
      "ROG 감성의 명품 트리플 팬 쿨링 및 완벽한 무소음 제로팬 탑재"
    ],
    cons: [
      "보급형에 비해 다소 높은 가격대와 부피가 커 작은 케이스 장착 제한",
      "RTX 50 시리즈 등장으로 세대 간 비교 대상이 될 수 있음"
    ],
    recommendedUsers: [
      "배틀그라운드 QHD 144Hz 고주사율 완벽 방어를 원하는 게이머",
      "4K 간단 비디오 에디팅 및 Stable Diffusion AI 드로잉 입문자"
    ],
    stockStatus: "in_stock"
  },
  {
    id: "gpu-rtx-4060ti",
    name: "Gigabyte GeForce RTX 4060 Ti WINDFORCE OC 8GB",
    category: "GPU",
    price: 550000,
    specs: {
      gpu: "RTX 4060 Ti (8GB)",
    },
    imageUrl: "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=600&q=80",
    description: "메인스트림 게이밍 최강 가성비 라인업으로 FHD 고프레임 게임 플레이어들에게 지속적으로 사랑받고 있습니다.",
    pros: [
      "FHD 환경 완벽 정복, 콤팩트한 듀얼 팬 디자인으로 높은 시스템 케이스 호환성",
      "DLSS 3 활용 시 하이엔드급에 준하는 프레임 성능 체감"
    ],
    cons: [
      "128bit 메모리 버스로 고해상도에서의 병목 현상 존재"
    ],
    recommendedUsers: [
      "FHD 주사율 모니터를 주력으로 사용하는 게이머",
      "가성비 견적으로 최상의 배틀그라운드 옵션 타협을 원하는 유저"
    ],
    stockStatus: "in_stock"
  },
  {
    id: "cpu-ryzen-7500f",
    name: "AMD Ryzen 5 7500F (라파엘)",
    category: "CPU",
    price: 220000,
    specs: {
      cpu: "6코어 12스레드",
      mb: "Socket AM5 지원",
    },
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
    description: "현존 게이밍 가성비 1순위 CPU입니다. 내장 그래픽을 제외해 가격을 낮추고 강력한 싱글코어 성능으로 게이밍 파워를 발휘합니다.",
    pros: [
      "현존 최고의 게이밍 가성비 레이아웃 제공",
      "낮은 발열로 2~3만원대 보급형 공랭 쿨러로도 충분히 커버 가능",
      "AM5 소켓 장기 유지 보장으로 향후 CPU만 교체 업그레이드 가능"
    ],
    cons: [
      "내장 그래픽이 없어 외장 그래픽카드 장착이 강제됨",
      "다중 코어 활용이 극심한 대용량 인코딩 작업에서는 상위 라인업 대비 속도 차이 발생"
    ],
    recommendedUsers: [
      "가성비 위주로 실속 있는 게이밍 컴퓨터를 조립하려는 유저",
      "향후 3~4년 후에도 부품 업그레이드 용이성을 챙기고 싶은 스마트 소비자"
    ],
    stockStatus: "in_stock"
  },
  {
    id: "cpu-intel-14400f",
    name: "Intel Core i5-14400F (랩터레이크 리프레시)",
    category: "CPU",
    price: 250000,
    specs: {
      cpu: "10코어 16스레드 (6P + 4E)",
      mb: "LGA1700 소켓 지원",
    },
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
    description: "전통의 명가 인텔의 하이브리드 코어 기술이 탑재된 다목적 멀티태스킹 CPU입니다. 게이밍과 사무, 간단 작업 모두 균형 잡혔습니다.",
    pros: [
      "P코어와 E코어 하이브리드 조합으로 방송 송출, 앱플레이어 구동 등 멀티태스킹에 강점",
      "메모리 컨트롤러 호환성 및 시스템 전반적인 안정성 우수"
    ],
    cons: [
      "게임 단일 성능 면에서는 경쟁사 Ryzen 7500F에 미세하게 뒤처지는 구도",
      "소켓 규격 변경 예정으로 추후 대대적인 CPU 업그레이드 시 메인보드도 같이 교체 필요"
    ],
    recommendedUsers: [
      "게임 플레이를 하면서 디스코드, 웹 브라우저, 음악 프로그램을 동시에 원활하게 구동하려는 멀티 유저",
      "작업 생산성(간단 캐드, 코딩, 포토샵)과 게임을 동시에 잡으려는 다목적 사용자"
    ],
    stockStatus: "in_stock"
  },
  {
    id: "cpu-ryzen-7800x3d",
    name: "AMD Ryzen 7 7800X3D (라파엘 3D V-Cache)",
    category: "CPU",
    price: 580000,
    specs: {
      cpu: "8코어 16스레드",
    },
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
    description: "게이밍 끝판왕 CPU. 대용량 3D V-Cache 기술로 프레임 드랍을 원천 차단하며 압도적인 프레임을 선사합니다.",
    pros: [
      "게임 벤치마크 압도적 세계 1위, 최상의 프레임 안정성 및 고주사율 모니터 스펙 폭발",
      "경쟁사 하이엔드 칩셋 대비 혁신적인 저전력 구동 능력"
    ],
    cons: [
      "게이밍 외 렌더링, 수치 연산 등 고순도 시네벤치 연산 작업에서는 가격 대비 극적인 우위를 점하지 않음"
    ],
    recommendedUsers: [
      "배틀그라운드나 로스트아크 등 국내 MMO, FPS의 미세 프레임 드랍조차 용납할 수 없는 극성 게이머",
      "최고사양 하이엔드 견적을 지향하는 퀄리티 게이밍 유저"
    ],
    stockStatus: "in_stock"
  },
  {
    id: "mb-asrock-b650m",
    name: "ASRock B650M PG Lightning",
    category: "Motherboard",
    price: 160000,
    specs: {
      mb: "AM5 B650 칩셋",
    },
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
    description: "안정적인 전원부와 합리적인 가격으로 AMD AM5 시스템 구축 시 가장 먼저 언급되는 메인스트림 메인보드입니다.",
    pros: [
      "12+2+1 페이즈의 튼튼한 Dr.MOS 전원부로 라이젠 9 등 고성능 칩셋도 소화 가능",
      "DDR5 메모리 고주사율 EXPO 완벽 대응 및 M.2 방열판 제공"
    ],
    cons: [
      "Wi-Fi 및 블루투스 기능은 번들로 제공되지 않아 동글이나 M.2 랜카드가 따로 필요"
    ],
    recommendedUsers: [
      "라이젠 5 7500F 또는 라이젠 7 7800X3D용 알짜배기 가성비/균형 보드를 찾는 유저"
    ],
    stockStatus: "in_stock"
  },
  {
    id: "ram-samsung-16g",
    name: "Samsung DDR5-5600 16GB",
    category: "RAM",
    price: 65000,
    specs: {
      ram: "DDR5 16GB (5600MHz)",
    },
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
    description: "안정성과 정직한 표준 스펙의 표준 DDR5 메모리입니다. 어떤 보드에서도 안심하고 장착하는 정품 램입니다.",
    pros: [
      "압도적인 고장 초기불량률 최저 수준의 대중적 신뢰도",
      "5600MHz의 고속 동작 속도로 쾌적한 전송 환경"
    ],
    cons: [
      "초록색/검은색 순정 기판 형태로 방열판이나 RGB 조명이 없어 튜닝 감성이 떨어짐"
    ],
    recommendedUsers: [
      "컴퓨터 호환성 문제없이 무조건 안전하고 기본기 단단한 구성을 원하는 유저"
    ],
    stockStatus: "in_stock"
  },
  {
    id: "ssd-samsung-990pro",
    name: "Samsung 990 PRO M.2 NVMe 1TB",
    category: "SSD",
    price: 160000,
    specs: {
      ssd: "PCIe 4.0 NVMe 1TB",
    },
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
    description: "현존 NVMe 최강 스피드와 정밀한 데이터 무결성을 제공하는 SSD 업계의 명작 플래그십 라인업입니다.",
    pros: [
      "최대 읽기 속도 7450MB/s의 초광속 성능으로 로딩 제로화",
      "동급 최장 수명 보장 및 발열 제어를 위한 향상된 니켈 컨트롤러 코팅"
    ],
    cons: [
      "일반 SATA 방식이나 저가형 NVMe에 비해 다소 비싼 프리미엄 단가"
    ],
    recommendedUsers: [
      "대용량 비디오 편집, 그래픽 텍스처 로딩이 빠른 작업용 및 쾌속 하이엔드 게이밍을 지향하는 유저"
    ],
    stockStatus: "in_stock"
  },
  {
    id: "power-classic-700w",
    name: "Micronix Classic II Full Change 700W 80PLUS BRONZE",
    category: "Power",
    price: 75000,
    specs: {
      power: "700W (80PLUS BRONZE)",
    },
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
    description: "대한민국 표준 파워 서플라이라 불리는 대표 제품입니다. 무상 AS 7년 지원과 고품질 대만제 캐패시터로 안전한 전력 공급을 제공합니다.",
    pros: [
      "7년 무상 보증 및 검증된 80PLUS BRONZE 등급 고효율",
      "낙뢰, 서지 차단 서지(Surge) 4K 기능으로 국내 환경 변동 전압 완벽 대처"
    ],
    cons: [
      "풀 모듈러 디자인이 아니라 필요 없는 선도 케이스 뒤로 같이 정리해야 함"
    ],
    recommendedUsers: [
      "RTX 5060, 4060 Ti, 4070 SUPER 사양에서 무난하고 고장률 적은 안심 전력 장착을 원하는 오너"
    ],
    stockStatus: "in_stock"
  }
];
