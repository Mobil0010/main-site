const { GEMINI_API_KEY, FIREBASE_API_KEY, FIREBASE_PROJECT_ID, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

async function run() {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const todayStr = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
    console.log(`[시작] ${todayStr} 자 자동 운세 생성을 시작합니다.`);

    // 💡 리스트에서 확인된 정식 v1 주소와 gemini-3.5-flash 매칭!
    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const promptText = `너는 아주 친절하고 위트 있는 점술가야. 오늘 날짜는 ${todayStr}이야. 오늘 하루를 시작하는 방문자들을 위해 재미있고, 희망적이며, 따뜻한 오늘의 총운을 정중하고 친근한 존댓말로 3~4문장 정도로 작성해 줘. 너무 뻔한 기계적인 말 말고 마음을 울리는 센스 있는 멘트로 써줘. 그리고 오늘의 운세를 아주 자세하고 정확하게 작성해. 예시로, "오늘은 새로운 시작이 기대되는 하루입니다. 작은 도전이 큰 기회로 이어질 수 있으니, 용기를 내어 한 걸음 내딛어 보세요. 사랑과 우정이 깊어지는 날이니, 소중한 사람들과 따뜻한 시간을 보내시길 바랍니다." 이런 식으로 작성해 줘.`;
    
    const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    const geminiData = await geminiRes.json();

    if (!geminiData.candidates || geminiData.candidates.length === 0) {
        console.error("❌ [구글 Gemini 반환 에러 원본]:", JSON.stringify(geminiData, null, 2));
        throw new Error("Gemini가 정상적인 답변을 주지 못했습니다.");
    }

    const fortuneText = geminiData.candidates[0].content.parts[0].text;
    console.log(`[Gemini] 운세 생성 완료: ${fortuneText.substring(0, 20)}...`);

    // 파이어베이스 인증 토큰 발급
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
    const authRes = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, returnSecureToken: true })
    });
    const authData = await authRes.json();
    const idToken = authData.idToken;

    // Firestore에 운세 저장 (PATCH 방식 우회)
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/fortunes/${encodeURIComponent(todayStr)}`;
    
    const dbRes = await fetch(firestoreUrl, {
        method: "PATCH",
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