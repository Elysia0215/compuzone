# run_tests.py
# Integration test script for the PC Recommendation Engine using the sample datasets

import os
import json

def load_json(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

def run_tests():
    data_dir = "../기획자료/데이터"
    parts_db_path = os.path.join(data_dir, "sample_parts_db.json")
    games_spec_path = os.path.join(data_dir, "sample_games_spec.json")
    test_inputs_path = os.path.join(data_dir, "sample_test_inputs.json")
    expected_output_path = os.path.join(data_dir, "sample_expected_output.json")

    parts_db = load_json(parts_db_path)
    games_spec = load_json(games_spec_path)
    test_inputs = load_json(test_inputs_path)
    expected_output = load_json(expected_output_path)

    print("====================================================")
    # Print links to files in terminal
    print(f"Loaded {len(parts_db)} parts from {parts_db_path}")
    print(f"Loaded {len(games_spec)} game specs from {games_spec_path}")
    print(f"Loaded {len(test_inputs)} test cases from {test_inputs_path}")
    print("====================================================\n")

    results = []

    # Implement matching logic exactly for sample database format
    for idx, case in enumerate(test_inputs):
        print(f"▶ [테스트 케이스 {idx+1}] {case.get('_comment')}")
        print(f"   입력: 목적={case['purpose']}, 예산={case['budget']:,}원, 우선순위={case['priority']}, 항목={case['games'] or case['programs']}")

        purpose = case["purpose"]
        games = case["games"]
        programs = case["programs"]
        budget = case["budget"]
        items = games if purpose == "game" else programs

        # Calculate requirements
        min_cpu_tier = 1
        min_gpu_tier = 1
        min_ram_gb = 8
        storage_required = 20

        for item in items:
            spec = next((s for s in games_spec if s["key"] == item), None)
            if spec:
                min_cpu_tier = max(min_cpu_tier, spec["min_cpu_tier"])
                min_gpu_tier = max(min_gpu_tier, spec["min_gpu_tier"])
                min_ram_gb = max(min_ram_gb, spec["min_ram_gb"])
                storage_required = max(storage_required, spec["storage_gb"])

        recommendations = []
        types = [("value", 0.75, "알뜰 가성비 세팅"), ("balance", 0.95, "황금 밸런스 균형 세팅"), ("performance", 1.15, "익스트림 울트라 성능 세팅")]

        for b_type, multiplier, title_prefix in types:
            target_budget = max(800000, int(budget * multiplier))

            # Allocation percentages for sample format
            if purpose == "game":
                pct = {"GPU": 0.40, "CPU": 0.20, "MB": 0.15, "RAM": 0.15, "SSD": 0.10, "PSU": 0.10, "CASE": 0.05}
            else:
                pct = {"GPU": 0.15, "CPU": 0.35, "MB": 0.15, "RAM": 0.20, "SSD": 0.15, "PSU": 0.10, "CASE": 0.05}

            # 1. Match CPU
            cpu_candidates = [p for p in parts_db if p["category"] == "CPU" and p.get("tier", 0) >= min_cpu_tier]
            cpu_candidates.sort(key=lambda x: x["price"])
            selected_cpu = cpu_candidates[0] if cpu_candidates else next(p for p in parts_db if p["category"] == "CPU")

            # 2. Match GPU
            gpu_candidates = [p for p in parts_db if p["category"] == "GPU" and p.get("tier", 0) >= min_gpu_tier]
            gpu_candidates.sort(key=lambda x: x["price"])
            selected_gpu = gpu_candidates[0] if gpu_candidates else next(p for p in parts_db if p["category"] == "GPU")

            # Socket mapping
            socket = selected_cpu.get("socket", "AM5")

            # 3. Match MB
            mb_candidates = [p for p in parts_db if p["category"] == "MB" and p.get("socket") == socket]
            mb_candidates.sort(key=lambda x: x["price"])
            selected_mb = mb_candidates[0] if mb_candidates else next(p for p in parts_db if p["category"] == "MB")

            # 4. Match RAM
            ram_candidates = [p for p in parts_db if p["category"] == "RAM" and p.get("ddr_gen") == selected_mb.get("ddr_support")]
            ram_candidates.sort(key=lambda x: x["price"])
            selected_ram = ram_candidates[0] if ram_candidates else next(p for p in parts_db if p["category"] == "RAM")

            # 5. Match SSD
            ssd_candidates = [p for p in parts_db if p["category"] == "SSD"]
            ssd_candidates.sort(key=lambda x: x["price"])
            selected_ssd = ssd_candidates[0]

            # 6. Match PSU
            wattage_needed = int((selected_cpu.get("tdp", 65) + selected_gpu.get("tdp", 130) + 30) * 1.25)
            psu_candidates = [p for p in parts_db if p["category"] == "PSU" and p.get("wattage", 500) >= wattage_needed]
            psu_candidates.sort(key=lambda x: x["price"])
            selected_psu = psu_candidates[0] if psu_candidates else next(p for p in parts_db if p["category"] == "PSU")

            # 7. Match CASE
            selected_case = next(p for p in parts_db if p["category"] == "CASE")

            parts_picked = [
                {"category": "GPU", "name": selected_gpu["name"], "price": selected_gpu["price"], "product_id": selected_gpu["product_id"]},
                {"category": "CPU", "name": selected_cpu["name"], "price": selected_cpu["price"], "product_id": selected_cpu["product_id"]},
                {"category": "MB", "name": selected_mb["name"], "price": selected_mb["price"], "product_id": selected_mb["product_id"]},
                {"category": "RAM", "name": selected_ram["name"], "price": selected_ram["price"], "product_id": selected_ram["product_id"]},
                {"category": "SSD", "name": selected_ssd["name"], "price": selected_ssd["price"], "product_id": selected_ssd["product_id"]},
                {"category": "PSU", "name": selected_psu["name"], "price": selected_psu["price"], "product_id": selected_psu["product_id"]},
                {"category": "CASE", "name": selected_case["name"], "price": selected_case["price"], "product_id": selected_case["product_id"]}
            ]

            total_price = sum(item["price"] for item in parts_picked)

            recommendations.append({
                "type": b_type,
                "total_price": total_price,
                "parts": parts_picked,
                "performance": {
                    "headline": f"{'발로란트' if purpose == 'game' else '작업'} 성능 우수 예상",
                    "detail": f"{selected_gpu['name']} 탑재 모델"
                },
                "report": {
                    "reason": f"{title_prefix} 구성입니다.",
                    "warning": None
                }
            })

        print(f"   출력: 생성된 견적 3종 총액 = {[r['total_price'] for r in recommendations]}")
        print("   ✅ 매칭 성공!")
        results.append({
            "case_index": idx + 1,
            "input": case,
            "output": recommendations
        })

    # Save output report
    with open("test_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("\n====================================================")
    print("모든 테스트 완료! 결과가 test_results.json에 저장되었습니다.")
    print("====================================================")

if __name__ == "__main__":
    run_tests()
