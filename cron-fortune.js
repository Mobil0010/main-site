const { GEMINI_API_KEY } = process.env;

async function run() {
    console.log("[디버그] 구글 서버에 사용 가능한 모델 목록을 요청합니다...");

    // 💡 구글 모델 서비스(ListModels) 호출 주소
    const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`;
    
    const res = await fetch(listUrl);
    const data = await res.json();

    // 콘솔창에 구글이 보내준 모델 리스트를 예쁘게 출력
    console.log("👉 [구글이 허락한 모델 리스트 원본]:\n", JSON.stringify(data, null, 2));
    
    // 리스트만 확인하고 뒤의 파이어베이스 로직은 실행 안 하고 잠시 종료
    process.exit(0);
}

run().catch(err => {
    console.error("요청 중 에러 발생:", err);
    process.exit(1);
});