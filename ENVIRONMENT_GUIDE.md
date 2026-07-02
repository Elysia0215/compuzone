# ⚙️ 협업을 위한 파이썬 개발환경 가이드 (Poetry & Anaconda)

이 프로젝트는 패키지 관리의 신뢰성을 위해 **Poetry(기본)**를 사용하면서, 아나콘다 환경을 사용하시는 팀원을 지원하기 위해 **pip + requirements.txt**를 이중으로 관리(하이브리드 세팅)합니다.

---

## 🅰️ 유형 A: Poetry 사용자용 가이드 (추천)
> **대상**: conda 없이 순수 파이썬 환경을 쓰고 있거나, 가상환경 동기화를 일원화하고 싶은 개발자

### 1. 최초 1회 초기 설정
터미널을 열고 `프로젝트` 폴더 내부로 이동한 뒤, 아래 명령어를 차례로 실행합니다:

```bash
# 1. Poetry가 잘 설치되었는지 확인
poetry --version

# 2. lock 파일 기준 가상환경 자동 생성 및 패키지 설치
poetry install
```

### 2. 일상 개발/구동 및 패키지 관리
* **서버 실행하기 (dev.py 실행)**:
  ```bash
  # poetry run 뒤에 실행할 명령어를 붙여 실행합니다
  poetry run python dev.py
  ```
* **새로운 패키지 추가하기**:
  새로운 외부 라이브러리 설치가 필요할 때 `pip install`을 사용하지 않고 아래 명령어를 씁니다:
  ```bash
  poetry add [설치할패키지명]
  ```
  *(예: `poetry add requests` 실행 시 pyproject.toml과 lock 파일에 기록되어 팀원들이 그대로 동기화할 수 있습니다.)*

---

## 🅲️ 유형 B: 아나콘다(Anaconda) 사용자용 가이드
> **대상**: 아나콘다(Conda)를 사용해 본인의 독립적인 환경을 구축하고 활성화하여 협업하는 개발자

### 1. 최초 1회 초기 설정
터미널을 열고 본인의 기존 콘다 가상환경을 활성화(또는 새로 생성)한 상태에서 패키지를 동기화합니다:

```bash
# 1. 아나콘다 가상환경 생성 (파이썬 3.11 또는 3.12 추천)
conda create -n comz-env python=3.11
conda activate comz-env

# 2. requirements.txt를 사용해 현재까지 설정된 패키지들을 콘다 환경 내에 설치
pip install -r requirements.txt
```

### 2. 일상 개발/구동 및 패키지 관리
* **서버 실행하기**:
  아나콘다 환경이 활성화(`(comz-env)`)되어 있으므로, 기존 방식대로 직접 명령어를 입력해 가동합니다:
  ```bash
  python dev.py
  ```
* **새로운 패키지 추가하기**:
  콘다 환경 내에서 직접 패키지를 설치하고, 다른 팀원들을 위해 `requirements.txt` 파일을 갱신해야 합니다.
  ```bash
  # 1. 패키지 설치
  pip install [패키지명]
  
  # 2. 패키지 리스트 갱신 (requirements.txt 업데이트)
  # (단, pip freeze > requirements.txt는 시스템 불필요 패키지가 꼬일 수 있으므로 
  #  새로 추가한 패키지명만 requirements.txt 맨 하단에 직접 타이핑해 적는 방법을 추천합니다.)
  ```

---

## ⚠️ 팀 전체가 알아야 할 공통 주의사항 (Rule)
1. **의존성 업데이트 시 교차 반영**:
   - 누군가 새로운 패키지를 추가하면 **Poetry 파일(`pyproject.toml`)**과 **`requirements.txt`**에 동시에 등록해주어야 합니다.
   - 예: `fastapi` 버전을 수정한다면 `pyproject.toml` 내부 dependencies 배열과 `requirements.txt` 파일 두 곳을 함께 고쳐서 커밋/푸시합니다.
2. **원격 저장소 동기화**:
   - `git pull` 이후 백엔드가 정상 구동되지 않을 때는:
     - **Poetry 사용자**: `poetry install` 실행
     - **아나콘다 사용자**: `pip install -r requirements.txt` 실행
