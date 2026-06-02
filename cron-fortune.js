const { 
    GEMINI_API_KEY, 
    FIREBASE_API_KEY, 
    FIREBASE_PROJECT_ID, 
    ADMIN_EMAIL, 
    ADMIN_PASSWORD,
    DISCORD_WEBHOOK_URL
} = process.env;

const FALLBACK_FORTUNES = [
    "오늘은 내면의 목소리에 귀를 기울이기 좋은 날입니다. 조급해하지 말고 차분하게 하루를 시작해 보세요.",
    "주변 사람들과의 따뜻한 대화 속에서 긍정적인 에너지를 얻을 수 있는 날입니다."
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 디스코드로 메시지를 보내는 헬퍼 함수
async function sendDiscordNotification(message) {
    if (!DISCORD_WEBHOOK_URL) {
        console.warn("디스코드 웹후크 URL이 설정되지 않았습니다.");
        return;
    }
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: message }) // 디스코드는 'content' 필드에 텍스트를 담아 보내면 돼
        });
        console.log("[디스코드] 알림 전송 성공");
    } catch (err) {
        console.error("[디스코드] 알림 전송 실패:", err.message);
    }
}

async function run() {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const todayStr = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
    console.log(`[시작] ${todayStr} 자 자동 운세 생성을 시작합니다.`);

    let fortuneText = "";
    const MAX_RETRIES = 3;

    // Gemini API 호출 (5분 간격, 최대 3번 재시도)
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[Gemini] 운세 생성 시도 (${attempt}/${MAX_RETRIES})...`);
            const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const promptText = `너는 아주 친절하고 위트 있는 점술가야. 오늘 날짜는 ${todayStr}이야. 오늘 하루를 시작하는 방문자들을 위해 재미있고, 희망적이며, 따뜻한 오늘의 총운을 정중하고 친근한 존댓말로 3~4문장 정도로 작성해 줘. 너무 뻔한 기계적인 말 말고 마음을 울리는 센스 있는 멘트로 써줘. 그리고 오늘의 운세를 아주 자세하고 정확하게 작성해. 예시로, "오늘은 새로운 시작이 기대되는 하루입니다. 작은 도전이 큰 기회로 이어질 수 있으니, 용기를 내어 한 걸음 내딛어 보세요. 사랑과 우정이 깊어지는 날이니, 소중한 사람들과 따뜻한 시간을 보내시길 바랍니다." 이런 식으로 작성해 줘. 실제 운세를 작성할 때는 절대 예시 문장을 그대로 쓰지 말고, 오늘 날짜에 맞는 새로운 운세 멘트를 만들어 줘. 운세 항목은 종합운, 금전운, 학업/업무운, 대인관계/애정운, 바이오리듬(퍼센트로 표현) 이렇게 5가지 항목으로 나눠서 작성해주고, 행운 가이드는 행운의 컬러, 행운의 아이템, 행운의 푸드, 행운의 장소, 오늘의 미션 (행동 지침) 이렇게 5가지로 나눠서 작성해줘.`;
            
            const geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
                signal: AbortSignal.timeout(60000)
            });
            const geminiData = await geminiRes.json();

            if (!geminiData.candidates || geminiData.candidates.length === 0) {
                throw new Error("Gemini가 정상적인 답변을 주지 못했습니다.");
            }

            fortuneText = geminiData.candidates[0].content.parts[0].text;
            console.log(`[Gemini] 운세 생성 완료!`);
            break;
        } catch (error) {
            console.error(`[시도 ${attempt} 실패]:`, error.message);
            
            // 일시적 실패 알림을 디스코드로 전송 (선택 사항)
            await sendDiscordNotification(`[운세봇 알림] Gemini 호출 시도 ${attempt}회 실패: ${error.message}`);

            if (attempt < MAX_RETRIES) {
                console.log(`5분 후 다시 시도합니다...`);
                await delay(300000); // 정확히 5분 대기
            }
        }
    }

    // 2️⃣ 3번 다 실패해서 백업 운세로 대체될 때 강력 경고 알림
    if (!fortuneText) {
        console.warn("Gemini API 호출에 모두 실패했습니다. 준비된 기본 운세로 대체합니다.");
        
        await sendDiscordNotification(`**[심각]** Gemini API 호출 3회 모두 실패! 금일 운세는 기본 백업 데이터로 대체되어 등록됩니다. 확인이 필요합니다.`);
        
        const randomIndex = Math.floor(Math.random() * FALLBACK_FORTUNES.length);
        fortuneText = FALLBACK_FORTUNES[randomIndex];
    }

    // 3️⃣ 파이어베이스 인증 및 저장 로직 수행
    try {
        const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
        const authRes = await fetch(authUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, returnSecureToken: true })
        });
        const authData = await authRes.json();
        const idToken = authData.idToken;

        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/fortunes/${encodeURIComponent(todayStr)}`;
        
        const dbRes = await fetch(firestoreUrl, {
            method: "PATCH",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({ fields: { content: { stringValue: fortuneText } } })
        });

        if (dbRes.ok) {
            console.log(`[성공] ${todayStr} 오늘의 운세가 파이어베이스에 최종 저장되었습니다!`);
            // 성공 알림도 받고 싶다면 주석 해제
            // await sendDiscordNotification(`[성공] ${todayStr} 오늘의 운세가 정상적으로 등록되었습니다.`);
        } else {
            const errText = await dbRes.text();
            throw new Error("파이어베이스 저장 실패: " + errText);
        }
    } catch (dbError) {
        console.error("[DB 저장 단계 최종 에러]:", dbError);
        
        // DB 저장 자체가 뻗어버렸을 때 알림
        await sendDiscordNotification(`**[치명적 오류]** 파이어베이스에 운세를 저장하는 데 실패했습니다! 에러 내용: ${dbError.message}`);
        
        process.exit(1);
    }
}

run();