// HTML要素を取得
const settingScreen = document.getElementById("settingScreen");
const cameraScreen = document.getElementById("cameraScreen");
const backButton = document.getElementById("backButton");
const toCameraFromSetting = document.getElementById("toCameraFromSetting");
const loginScreen = document.getElementById("loginScreen");
const loginButton = document.getElementById("loginButton");
const scoreScreen = document.getElementById("scoreScreen");
const goodTimeEl = document.getElementById("goodTime");
const badTimeEl = document.getElementById("badTime");
const scoreValueEl = document.getElementById("scoreValue");
const scoreMessageEl = document.getElementById("scoreMessage");
const backToSettingButton = document.getElementById("backToSettingButton");
const video = document.getElementById("cam");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const button = document.getElementById("startStopButton");
const postureStatus = document.getElementById("postureStatus");
const angleInfo = document.getElementById("angleInfo");
const goodPostureTimer = document.getElementById("goodPostureTimer");
const motivationMessage = document.getElementById("motivationMessage");
const maxScoreValueEl = document.getElementById("maxScoreValue");
const avgScoreValueEl = document.getElementById("avgScoreValue");

// 記録用のオブジェクト
let postureLog = getPostureLog();
let lastDateKey = getNowKey().dateKey;
let weeklyChart = null;

// 制御用の変数
let camera = null;
let isCameraRunning = false;

// タイマー関連の変数
let goodPostureStartTime = null;
let goodPostureTotalTime = 0;
let lastPostureState = null;
let lastMessageMilestone = 0;

// 猫背状態の時間管理
let slouchStartTime = null;
const SLOUCH_RESET_THRESHOLD = 5000;

// 悪い姿勢の累計時間（ms）
let badPostureTotalTime = 0;
let badPostureStartTime = null;

// 設定値
// 設定値 (固定)
const SLOUCH_THRESHOLD = 165;
const DETECTION_CONFIDENCE = 0.5;

// 画面切り替え（必ず先に定義）
function showScreen(screen) {
    const screens = ["loginScreen", "settingScreen", "cameraScreen", "scoreScreen"];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
    if (screen) screen.style.display = "flex";
}

// 現在時刻を取得する関数
function getNowKey() {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const hourKey = String(now.getHours()).padStart(2, '0'); // 00〜23
    return { dateKey, hourKey };
}

// 時間を加算する関数
function addPostureLog(type, elapsedMs) {
    const { dateKey, hourKey } = getNowKey();
    if (!postureLog[dateKey]) {
        postureLog[dateKey] = {};
    }
    if (!postureLog[dateKey][hourKey]) {
        postureLog[dateKey][hourKey] = { good: 0, bad: 0 };
    }
    postureLog[dateKey][hourKey][type] += elapsedMs;
    savePostureLog(postureLog);
}

// 日付が変わった瞬間の対策する関数
function checkDateChange(currentTime) {
    const nowKey = getNowKey().dateKey;
    if (nowKey !== lastDateKey) {
        if (goodPostureStartTime !== null) {
            const elapsed = currentTime - goodPostureStartTime;
            goodPostureTotalTime += elapsed;
            goodPostureStartTime = currentTime;
        }
        if (badPostureStartTime !== null) {
            const elapsed = currentTime - badPostureStartTime;
            badPostureTotalTime += elapsed;
            addPostureLog("bad", elapsed);
            badPostureStartTime = null;
        }
        lastDateKey = nowKey;
    }
}

// 直近1週間の日付配列を作る関数
function getLast7Days() {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
        const label = `${d.getMonth() + 1}/${d.getDate()}`; // M/D
        days.push({ key, label });
    }
    return days;
}

// 日付ごとの合計時間を集計する関数
function getWeeklySummary() {
    const log = getPostureLog();
    const days = getLast7Days();
    const labels = [];
    const goodData = [];
    const badData = [];
    days.forEach(({ key, label }) => {
        let goodSum = 0;
        let badSum = 0;
        if (log[key]) {
            Object.values(log[key]).forEach(hourData => {
                goodSum += hourData.good || 0;
                badSum += hourData.bad || 0;
            });
        }
        // ms → 分 に変換
        labels.push(label);
        goodData.push(Math.floor(goodSum / 60000));
        badData.push(Math.floor(badSum / 60000));
    });
    return { labels, goodData, badData };
}

// 棒グラフを描画する関数
function renderWeeklyChart() {
    const { labels, goodData, badData } = getWeeklySummary();
    const ctx = document.getElementById("weeklyChart").getContext("2d");
    if (weeklyChart) {
        weeklyChart.destroy();
    }
    weeklyChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "良い姿勢（分）",
                    data: goodData,
                    backgroundColor: "rgba(54, 162, 235, 0.7)",
                    barPercentage: 0.6,
                    categoryPercentage: 0.6
                },
                {
                    label: "猫背（分）",
                    data: badData,
                    backgroundColor: "rgba(255, 99, 132, 0.7)",
                    barPercentage: 0.6,
                    categoryPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            resizeDelay: 0,
            events: [],
        }
    });
}

function getPostureLog() {
    const user = getCurrentUser();
    if (!user) return {};
    return JSON.parse(localStorage.getItem(`postureLog_${user}`)) || {};
}

function savePostureLog(log) {
    const user = getCurrentUser();
    if (!user) return;
    localStorage.setItem(`postureLog_${user}`, JSON.stringify(log));
}

/* =========================
モチベーションメッセージ定義
良い姿勢の継続時間に応じて表示
time : ミリ秒
========================= */
const motivationMessages = [
    { time: 30000, message: "🎉 30秒達成！いい調子！" },
    { time: 60000, message: "✨ 1分達成！素晴らしい！" },
    { time: 90000, message: "🌟 1分30秒達成！すごいです！" },
    { time: 120000, message: "🔥 2分達成！その調子！" },
    { time: 150000, message: "💪 2分30秒達成！頑張ってます！" },
    { time: 180000, message: "🏆 3分達成！最高です！" },
    { time: 240000, message: "👑 4分達成！素晴らしい集中力！" },
    { time: 300000, message: "🌈 5分達成！驚異的です！" },
    { time: 600000, message: "⭐ 10分達成！プロフェッショナル！" },
    { time: 1800000, message: "🎯 30分達成！伝説的です！" },
    { time: 3000000, message: "😶 50分達成！もはや怖い！怖すぎます！逃げろー！！" }
];

/* =========================
   最長スコア関連の関数
========================= */
function getMaxScore() {
    const user = getCurrentUser();
    if (!user) return 0;
    return parseInt(localStorage.getItem(`maxScore_${user}`) || "0", 10);
}

function checkAndSaveMaxScore(currentScoreMs) {
    const maxScore = getMaxScore();
    if (currentScoreMs > maxScore) {
        const user = getCurrentUser();
        if (user) {
            localStorage.setItem(`maxScore_${user}`, currentScoreMs);
            console.log(`🎉 New Max Score Saved: ${currentScoreMs}ms`);
        }
    }
}

function updateMaxScoreUI() {
    if (!maxScoreValueEl) return;
    const maxScore = getMaxScore();
    if (maxScore > 0) {
        maxScoreValueEl.textContent = formatTimeMMSSJapanese(maxScore);
    } else {
        maxScoreValueEl.textContent = "--分--秒";
    }
}

/* =========================
   平均姿勢維持時間関連の関数
========================= */
function getAverageStats() {
    const user = getCurrentUser();
    if (!user) return { totalGoodTime: 0, sessionCount: 0 };
    return JSON.parse(localStorage.getItem(`stats_${user}`) || '{"totalGoodTime": 0, "sessionCount": 0}');
}

function saveAverageStats(stats) {
    const user = getCurrentUser();
    if (user) {
        localStorage.setItem(`stats_${user}`, JSON.stringify(stats));
    }
}

function updateAverageScore(currentSessionGoodTime) {
    // セッション時間が0の場合はカウントしない（誤操作対策）
    if (currentSessionGoodTime <= 0) return;

    const stats = getAverageStats();
    stats.totalGoodTime += currentSessionGoodTime;
    stats.sessionCount += 1;
    saveAverageStats(stats);
    updateAverageScoreUI();
    console.log(`📊 Updated Stats - Total: ${stats.totalGoodTime}, Count: ${stats.sessionCount}, Avg: ${stats.totalGoodTime / stats.sessionCount}`);
}

function updateAverageScoreUI() {
    if (!avgScoreValueEl) return;
    const stats = getAverageStats();
    if (stats.sessionCount > 0) {
        const averageMs = stats.totalGoodTime / stats.sessionCount;
        avgScoreValueEl.textContent = formatTimeMMSSJapanese(averageMs);
    } else {
        avgScoreValueEl.textContent = "--分--秒";
    }
}

function formatTimeMMSSJapanese(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}分${seconds}秒`;
}

/* =========================
ミリ秒(ms) → "mm:ss" に変換
========================= */
function formatTimeMMSS(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/* =========================
モチベーションメッセージ表示処理
一定時間ごとに一度だけ表示
totalTime : 良い姿勢の累計時間
========================= */
function showMotivationMessage(totalTime) {
    for (let i = 0; i < motivationMessages.length; i++) {
        const milestone = motivationMessages[i];
        if (totalTime >= milestone.time && lastMessageMilestone < milestone.time) {
            lastMessageMilestone = milestone.time;
            motivationMessage.textContent = milestone.message;
            // modify colors back to default (blue) just in case
            motivationMessage.classList.remove('from-[#ff6b6b]', 'to-[#c92a2a]');
            motivationMessage.classList.add('from-[#667eea]', 'to-[#764ba2]');

            motivationMessage.classList.add('opacity-100', 'translate-x-0', 'animate-celebrate');
            setTimeout(() => {
                motivationMessage.classList.remove('opacity-100', 'translate-x-0');
            }, 3000);
            setTimeout(() => {
                motivationMessage.classList.remove('animate-celebrate');
            }, 600);
            break;
        }
    }
}

//スコア評価コメント
function getScoreMessage(score) {
    if (score >= 90) return "✨ 素晴らしい姿勢です！";
    if (score >= 70) return "👍 とても良い姿勢です";
    if (score >= 50) return "🙂 もう少し意識しましょう";
    return "⚠️ 猫背が多めです";
}

// 現在ログイン中のユーザー名を取得する関数
function getCurrentUser() {
    return localStorage.getItem("loginUser");
}

/* =========================
猫背リセットメッセージ表示
猫背が一定時間続いた場合に通知
========================= */
function showResetMessage() {
    motivationMessage.textContent = "💥 猫背5秒経過！記録リセット！";
    // Change to red gradient and show
    motivationMessage.classList.remove('from-[#667eea]', 'to-[#764ba2]');
    motivationMessage.classList.add('from-[#ff6b6b]', 'to-[#c92a2a]', 'opacity-100', 'translate-x-0', 'animate-celebrate');

    setTimeout(() => {
        motivationMessage.classList.remove('opacity-100', 'translate-x-0');
    }, 3000);
    setTimeout(() => {
        motivationMessage.classList.remove('animate-celebrate');
        // Revert colors
        motivationMessage.classList.remove('from-[#ff6b6b]', 'to-[#c92a2a]');
        motivationMessage.classList.add('from-[#667eea]', 'to-[#764ba2]');
    }, 600);
}



/* =========================
設定画面へ戻る処理
カメラ動作中は安全に停止
========================= */
backButton.addEventListener('click', () => {
    if (isCameraRunning) {
        stopCameraAndPose();
    }
    cameraScreen.style.display = 'none';
    settingScreen.style.display = 'flex';
});

/* =========================
MediaPipe Pose 初期化
姿勢推定モデルを準備
========================= */
const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

/* =========================
Pose 推定オプション設定
精度と滑らかさのバランス調整
========================= */
pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
});

/* =========================
3点から角度を計算する関数
pointB を頂点とした角度を算出
========================= */
function calculateAngle(pointA, pointB, pointC) {
    const radians = Math.atan2(pointC.y - pointB.y, pointC.x - pointB.x) -
        Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
        angle = 360 - angle;
    }
    return angle;
}

/* =========================
猫背判定処理
耳・肩・腰の中点から姿勢角度を算出
========================= */
function detectSlouch(landmarks) {
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    const earMid = {
        x: (leftEar.x + rightEar.x) / 2,
        y: (leftEar.y + rightEar.y) / 2
    };
    const shoulderMid = {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2
    };
    const hipMid = {
        x: (leftHip.x + rightHip.x) / 2,
        y: (leftHip.y + rightHip.y) / 2
    };

    const angle = calculateAngle(earMid, shoulderMid, hipMid);
    const isSlouching = angle < SLOUCH_THRESHOLD;
    return { isSlouching, angle: angle.toFixed(1) };
}

/* =========================
Pose 推定結果の受信処理
毎フレーム呼び出される
========================= */
pose.onResults((results) => {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentTime = Date.now();
    checkDateChange(currentTime);

    if (isCameraRunning && results.image) {
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }

    if (results.poseLandmarks) {
        const { isSlouching, angle } = detectSlouch(results.poseLandmarks);
        const currentTime = Date.now();

        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 4
        });

        // drawLandmarksの代わりに、耳以外の顔パーツを除外して描画
        // 顔のランドマークは 0〜10
        // 耳は 7 (左), 8 (右) なのでこれらは描画する
        // 除外対象: 0, 1, 2, 3, 4, 5, 6, 9, 10
        for (let i = 0; i < results.poseLandmarks.length; i++) {
            // 顔のパーツ(0-10)かつ耳(7,8)以外ならスキップ
            if (i <= 10 && i !== 7 && i !== 8) {
                continue;
            }
            const landmark = results.poseLandmarks[i];

            // 描画処理 (drawLandmarksのデフォルトスタイルに似せる: 赤色、半径適当)
            ctx.beginPath();
            ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#FF0000';
            ctx.fill();
        }

        if (!isSlouching && lastPostureState === true) {
            if (badPostureStartTime !== null) {
                const elapsedBad = currentTime - badPostureStartTime;
                badPostureTotalTime += currentTime - badPostureStartTime;
                addPostureLog("bad", elapsedBad);
                badPostureStartTime = null;
            }
            goodPostureStartTime = currentTime;
        }

        if (isSlouching && lastPostureState === false && goodPostureStartTime !== null) {
            const elapsedGood = currentTime - goodPostureStartTime;
            goodPostureTotalTime += elapsedGood;
            addPostureLog("good", elapsedGood);
            goodPostureStartTime = null;
            badPostureStartTime = currentTime;
        }

        if (isSlouching && lastPostureState === null && badPostureStartTime === null) {
            badPostureStartTime = currentTime;
        }

        if (!isSlouching) {
            if (goodPostureStartTime === null) {
                goodPostureStartTime = currentTime;
            }
            const displayGoodTime =
                goodPostureStartTime !== null
                    ? goodPostureTotalTime + (currentTime - goodPostureStartTime)
                    : goodPostureTotalTime;
            goodPostureTimer.textContent = `良い姿勢: ${formatTimeMMSS(displayGoodTime)}`;
            showMotivationMessage(displayGoodTime);
        }

        if (isSlouching) {
            postureStatus.textContent = "⚠️ 猫背を検知しました！";
            postureStatus.classList.remove("bg-[#6c757d]", "bg-[#28a745]", "bg-[#dc3545]", "animate-pulse-scale");
            postureStatus.classList.add("bg-[#dc3545]", "animate-pulse-scale"); // Red
        } else {
            postureStatus.textContent = "✅ 良い姿勢です";
            postureStatus.classList.remove("bg-[#6c757d]", "bg-[#28a745]", "bg-[#dc3545]", "animate-pulse-scale");
            postureStatus.classList.add("bg-[#28a745]"); // Green
        }

        angleInfo.textContent = `角度: ${angle}° (基準: ${SLOUCH_THRESHOLD}°)`;

        if (isSlouching) {
            ctx.fillStyle = 'rgba(220, 53, 69, 0.8)';
            ctx.fillRect(10, 10, 280, 60);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 24px Arial';
            ctx.fillText('⚠️ 猫背を検知！', 20, 45);
        }

        lastPostureState = isSlouching;
    } else {
        postureStatus.textContent = "姿勢を検出していません";
        postureStatus.classList.remove("bg-[#6c757d]", "bg-[#28a745]", "bg-[#dc3545]", "animate-pulse-scale");
        postureStatus.classList.add("bg-[#6c757d]"); // Gray
        angleInfo.textContent = "角度: -- °";
        lastPostureState = null;
        slouchStartTime = null;
        if (goodPostureStartTime !== null) {
            const currentTime = Date.now();
            const elapsed = currentTime - goodPostureStartTime;
            goodPostureTotalTime += elapsed;
            goodPostureStartTime = null;
        }
    }
    ctx.restore();
});

function calculateScore(goodMs, badMs) {
    const total = goodMs + badMs;
    if (total === 0) return 0;
    return Math.round((goodMs / total) * 100);
}

function updateScoreScreen() {
    const safeGoodTime =
        goodPostureStartTime !== null
            ? goodPostureTotalTime + (Date.now() - goodPostureStartTime)
            : goodPostureTotalTime;
    const safeBadTime =
        badPostureStartTime !== null
            ? badPostureTotalTime + (Date.now() - badPostureStartTime)
            : badPostureTotalTime;
    const score = calculateScore(safeGoodTime, safeBadTime);
    goodTimeEl.textContent = formatTimeMMSS(safeGoodTime);
    badTimeEl.textContent = formatTimeMMSS(safeBadTime);
    scoreValueEl.textContent = score;
    scoreMessageEl.textContent = getScoreMessage(score);
}

function showScoreScreen() {
    showScreen(scoreScreen);
    renderWeeklyChart();
}

backToSettingButton.addEventListener("click", () => {
    showScreen(settingScreen);
});

async function startCameraAndPose() {
    if (isCameraRunning) return;

    goodPostureStartTime = null;
    badPostureStartTime = null;
    goodPostureTotalTime = 0;
    badPostureTotalTime = 0;
    lastPostureState = null;
    slouchStartTime = null;
    lastMessageMilestone = 0;

    goodPostureTimer.textContent = "良い姿勢: 00:00";
    postureStatus.textContent = "姿勢を検出していません";
    angleInfo.textContent = "角度: -- °";

    try {
        camera = new Camera(video, {
            onFrame: async () => {
                if (isCameraRunning) {
                    await pose.send({ image: video });
                }
            },
            width: 640,
            height: 480
        });

        await camera.start();
        isCameraRunning = true;
        button.textContent = "カメラを停止";
        button.classList.remove('bg-[#007bff]');
        button.classList.add('bg-[#dc3545]');
        console.log("Camera started successfully");
    } catch (error) {
        console.error("Camera start error:", error);
        alert("カメラの起動に失敗しました。カメラの権限を確認してください。");
    }
}

function stopCameraAndPose() {
    if (!isCameraRunning) return;

    console.log("Stopping camera...");
    isCameraRunning = false;

    if (camera) {
        try {
            camera.stop();
        } catch (error) {
            console.error("Camera stop error:", error);
        }
    }

    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => {
            track.stop();
            console.log("Track stopped:", track.kind);
        });
        video.srcObject = null;
    }

    const now = Date.now();
    if (lastPostureState === false && goodPostureStartTime !== null) {
        goodPostureTotalTime += (now - goodPostureStartTime);
        goodPostureStartTime = null;
    }
    if (lastPostureState === true && badPostureStartTime !== null) {
        const elapsedBad = now - badPostureStartTime;
        badPostureTotalTime += (now - badPostureStartTime);
        addPostureLog("bad", elapsedBad);
        badPostureStartTime = null;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    camera = null;
    button.textContent = "カメラを起動";
    button.classList.remove('bg-[#dc3545]');
    button.classList.add('bg-[#007bff]');
    postureStatus.textContent = "姿勢を検出していません";
    postureStatus.classList.remove("bg-[#6c757d]", "bg-[#28a745]", "bg-[#dc3545]", "animate-pulse-scale");
    postureStatus.classList.add("bg-[#6c757d]");
    angleInfo.textContent = "角度: -- °";
    goodPostureStartTime = null;
    lastMessageMilestone = 0;
    slouchStartTime = null;
    goodPostureTimer.textContent = `良い姿勢: 00:00`;
    motivationMessage.classList.remove('opacity-100', 'translate-x-0');

    console.log("Camera stopped successfully");
    updateScoreScreen();
    // 最長スコアの更新チェック
    checkAndSaveMaxScore(goodPostureTotalTime);
    updateMaxScoreUI(); // UI更新
    // 平均スコアの更新
    updateAverageScore(goodPostureTotalTime);
    showScreen(scoreScreen);
    setTimeout(() => renderWeeklyChart(), 0);
}

button.addEventListener('click', async () => {
    button.disabled = true;
    if (isCameraRunning) {
        stopCameraAndPose();
    } else {
        await startCameraAndPose();
    }
    button.disabled = false;
});

window.addEventListener('beforeunload', () => {
    if (isCameraRunning) {
        stopCameraAndPose();
    }
});

async function saveUserProfile(user) {
    const uid = user.uid;

    await window.firestoreSetDoc(
        window.firestoreDoc(window.firestoreDB, "users", uid),
        {
            name: user.displayName,
            email: user.email,
            lastLogin: new Date()
        },
        { merge: true }
    );

    console.log("✅ Firestore にユーザー登録完了");
}

/* ============================================================
   🔥 Firebaseログイン処理（Google認証）
============================================================ */
if (loginButton) {
    loginButton.addEventListener("click", async () => {
        try {
            // HTMLで読み込んだFirebase関数を使用
            const result = await window.firebaseSignInWithPopup(
                window.firebaseAuth,
                window.googleProvider
            );
            const user = result.user;
            // 🔥 Firestore にユーザー情報を保存
            await window.firestoreSetDoc(
                window.firestoreDoc(window.firestoreDB, "users", user.uid),
                {
                    name: user.displayName || "",
                    email: user.email || "",
                    lastLogin: new Date()
                },
                { merge: true }
            );


            // ユーザー情報を保存
            localStorage.setItem("loginUser", user.displayName || user.email);
            localStorage.setItem("firebaseUID", user.uid);

            console.log("✅ ログイン成功:", user.displayName);

            // 🔽 Firestore にユーザー登録
            await saveUserProfile(user);


            updateLoginUserName();
            showScreen(settingScreen);

            pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: DETECTION_CONFIDENCE,
                minTrackingConfidence: DETECTION_CONFIDENCE,
            });

        } catch (error) {
            console.error("❌ ログインエラー:", error);
            alert("ログインに失敗しました: " + error.message);
        }
    });
}

if (toCameraFromSetting) {
    toCameraFromSetting.addEventListener("click", () => {
        settingScreen.style.display = "none";
        cameraScreen.style.display = "flex";

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: DETECTION_CONFIDENCE,
            minTrackingConfidence: DETECTION_CONFIDENCE,
        });
    });
}

function updateLoginUserName() {
    const user = localStorage.getItem("loginUser");
    document.querySelectorAll(".loginUserName").forEach(el => {
        el.textContent = user ? user : "未ログイン";
    });
    updateMaxScoreUI(); // ユーザー変更時に最長スコアも更新
    updateAverageScoreUI(); // 平均スコアも更新
}

/* ============================================================
   🔥 Firebaseログアウト処理
============================================================ */
async function logout() {
    try {
        await window.firebaseSignOut(window.firebaseAuth);

        localStorage.removeItem("loginUser");
        localStorage.removeItem("firebaseUID");

        console.log("✅ ログアウト成功");

        updateLoginUserName();

        if (isCameraRunning) {
            stopCameraAndPose();
        }

        showScreen(loginScreen);
    } catch (error) {
        console.error("❌ ログアウトエラー:", error);
    }
}

/* ============================================================
   🔥 Firebase認証状態の監視
   ページ読み込み時に自動でログイン状態をチェック
============================================================ */
window.addEventListener("load", () => {
    updateLoginUserName();

    // Firebaseの認証状態を監視
    window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
        if (user) {
            // ログイン済み
            localStorage.setItem("loginUser", user.displayName || user.email);
            localStorage.setItem("firebaseUID", user.uid);
            updateLoginUserName();

            console.log("✅ 認証状態: ログイン中", user.displayName);

            // ログイン画面が表示されている場合のみ設定画面へ
            if (loginScreen.style.display !== "none") {
                showScreen(settingScreen);
            }
        } else {
            // ログアウト状態
            localStorage.removeItem("loginUser");
            localStorage.removeItem("firebaseUID");
            updateLoginUserName();

            console.log("⚠️ 認証状態: 未ログイン");
            showScreen(loginScreen);
        }
    });
});

/*canvasのサイズを固定する*/
function fixCanvasSize() {
    canvas.width = 640;
    canvas.height = 480;
}

fixCanvasSize();
/*カメラ表示エリアのサイズを調整する*/
function resizeCanvas() {
    const canvas = document.getElementById("canvas");
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width;
    canvas.height = rect.height;
}