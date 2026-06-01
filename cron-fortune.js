const { GEMINI_API_KEY, FIREBASE_API_KEY, FIREBASE_PROJECT_ID, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

// 💡 API 실패 시 사용할 백업용 기본 운세 리스트
const FALLBACK_FORTUNES = [
    "오늘은 내면의 목소리에 귀를 기울이기 좋은 날입니다. 조급해하지 말고 차분하게 하루를 시작해 보세요. 뜻밖의 작은 행복이 찾아올 정겨운 하루가 될 것입니다.",
    " 주변 사람들과의 따뜻한 대화 속에서 긍정적인 에너지를 얻을 수 있는 날입니다. 평소 고마웠던 마음을 가볍게 표현해 보는 건 어떨까요?",
    "새로운 도전도 좋지만, 오늘은 이미 당신이 이뤄낸 것들을 돌아보며 스스로를 칭찬해 주는 시간을 가져보세요. 당신은 생각보다 훨씬 더 잘해내고 있습니다.",
    "맑은 하늘을 보며 가볍게 스트레칭을 해보세요. 예상치 못한 곳에서 가벼운 행운이 찾아와 당신의 하루를 환하게 밝혀줄 것입니다."
];

// ⏳ 일정 시간 대기하기 위한 헬퍼 함수
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const todayStr = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
    console.log(`[시작] ${todayStr} 자 자동 운세 생성을 시작합니다.`);

    let fortuneText = "";
    const MAX_RETRIES = 3; // 최대 재시도 횟수

    // 1️⃣ Gemini API 호출 (최대 3번 재시도 로직)
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[Gemini] 운세 생성 시도 (${attempt}/${MAX_RETRIES})...`);
            const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const promptText = `너는 아주 친절하고 위트 있는 점술가야. 오늘 날짜는 ${todayStr}이야. 오늘 하루를 시작하는 방문자들을 위해 재미있고, 희망적이며, 따뜻한 오늘의 총운을 정중하고 친근한 존댓말로 3~4문장 정도로 작성해 줘. 너무 뻔한 기계적인 말 말고 마음을 울리는 센스 있는 멘트로 써줘. 그리고 오늘의 운세를 아주 자세하고 정확하게 작성해. 예시로, "오늘은 새로운 시작이 기대되는 하루입니다. 작은 도전이 큰 기회로 이어질 수 있으니, 용기를 내어 한 걸음 내딛어 보세요. 사랑과 우정이 깊어지는 날이니, 소중한 사람들과 따뜻한 시간을 보내시길 바랍니다." 이런 식으로 작성해 줘.`;
            
            const geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
                signal: AbortSignal.timeout(10000) // 10초 타임아웃 설정 (네트워크 먹통 대비)
            });
            const geminiData = await geminiRes.json();

            if (!geminiData.candidates || geminiData.candidates.length === 0) {
                throw new Error("Gemini가 정상적인 답변을 주지 못했습니다.");
            }

            fortuneText = geminiData.candidates[0].content.parts[0].text;
            console.log(`[Gemini] 운세 생성 완료!`);
            break; // 성공했으므로 루프 탈출
        } catch (error) {
            console.error(`❌ [시도 ${attempt} 실패]:`, error.message);
            if (attempt < MAX_RETRIES) {
                console.log(`5분 후 다시 시도합니다...`);
                await delay(300000); // 5분 대기 후 재시도
            }
        }
    }

    // 2️⃣ 만약 3번 다 실패했다면? 기본 운세로 대체 (Fallback)
    if (!fortuneText) {
        console.warn("⚠️ Gemini API 호출에 모두 실패했습니다. 준비된 기본 운세로 대체합니다.");
        const randomIndex = Math.floor(Math.random() * FALLBACK_FORTUNES.length);
        fortuneText = FALLBACK_FORTUNES[randomIndex];
    }

    // 3️⃣ 파이어베이스 인증 및 저장 로직 수행
    try {
        // 파이어베이스 인증 토큰 발급
        const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
        const authRes = await fetch(authUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, returnSecureToken: true })
        });
        const authData = await authRes.json();
        const idToken = authData.idToken;

        // Firestore에 운세 저장
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
            console.log(`[성공] ${todayStr} 오늘의 운세가 파이어베이스에 최종 저장되었습니다!`);
        } else {
            const errText = await dbRes.text();
            throw new Error("파이어베이스 저장 실패: " + errText);
        }
    } catch (dbError) {
        console.error("❌ [DB 저장 단계 최종 에러]:", dbError);
        process.exit(1);
    }
}

run();