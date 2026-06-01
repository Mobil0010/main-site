// 깃허브 액션 로봇 전용 자동화 스크립트
const { GEMINI_API_KEY, FIREBASE_API_KEY, FIREBASE_PROJECT_ID, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

async function run() {
    // 1. 한국 시간 기준으로 오늘 날짜 문자열 구하기
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const todayStr = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
    console.log(`[시작] ${todayStr} 자 자동 운세 생성을 시작합니다.`);

    // 2. Gemini 1.5 Flash 모델에게 오늘의 운세 요청하기
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const promptText = `너는 아주 친절하고 위트 있는 스타 점술가야. 오늘 날짜는 ${todayStr}이야. 오늘 하루를 시작하는 방문자들을 위해 재미있고, 희망적이며, 따뜻한 오늘의 총운을 정중하고 친근한 존댓말로 3~4문장 정도로 작성해 줘.`;
    
    const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    const geminiData = await geminiRes.json();

    // 👉 구글이 에러를 반환했는지 안전하게 먼저 검사합니다.
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
        console.error("❌ [구글 Gemini 반환 에러 원본]:", JSON.stringify(geminiData, null, 2));
        throw new Error("Gemini가 정상적인 답변을 주지 못했습니다. 위의 에러 원본을 확인해 주세요.");
    }

    const fortuneText = geminiData.candidates[0].content.parts[0].text;
    console.log(`[Gemini] 운세 생성 완료: ${fortuneText.substring(0, 20)}...`);

    // 3. 파이어베이스 Auth REST API를 사용하여 로그인 토큰 발급 받기
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
    const authRes = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, returnSecureToken: true })
    });
    const authData = await authRes.json();
    const idToken = authData.idToken;

    // 4. Firestore REST API를 사용하여 오늘 날짜 문서 ID로 운세 강제 덮어쓰기 저장
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/fortunes/${encodeURIComponent(todayStr)}`;
    
    const dbRes = await fetch(firestoreUrl, {
        method: "PATCH", // 문서가 없으면 생성, 있으면 수정
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
            fields: {
                content: { stringValue: fortuneText }
            }
        })
    });

    if (dbRes.ok) {
        console.log(`[성공] ${todayStr} 오늘의 운세가 파이어베이스에 자동으로 저장되었습니다!`);
    } else {
        const errText = await dbRes.text();
        throw new Error("파이어베이스 저장 실패: " + errText);
    }
}

run().catch(err => {
    console.error("[에러 발생]:", err);
    process.exit(1);
});