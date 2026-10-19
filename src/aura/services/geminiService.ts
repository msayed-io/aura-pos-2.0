// Gemini AI Service - with graceful fallback when @google/genai is not installed
// This service is a stub that gracefully handles the missing @google/genai package

let genAI: any = null;

const getGeminiAPI = async (): Promise<any> => {
    if (!genAI) {
        try {
            // Dynamic require with eval to avoid Next.js module resolution at build time
            const apiKey = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_GEMINI_API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || '';
            if (!apiKey) {
                console.warn('Gemini API key is not configured. AI features will be disabled.');
                return null;
            }
            // Only attempt import if API key exists and we're in browser
            if (typeof window !== 'undefined') {
                const genaiModule = await import(/* webpackIgnore: true */ /* @vite-ignore */ '@google/genai').catch(() => null);
                if (genaiModule?.GoogleGenAI) {
                    genAI = new genaiModule.GoogleGenAI({ apiKey });
                }
            }
        } catch (error) {
            console.warn('@google/genai package is not installed. AI features will be disabled.', error);
            return null;
        }
    }
    return genAI;
};

export const generateAIManagerSummary = async (
    totalSales: number,
    topItemName: string | null,
    topCashierName: string | null,
    userName: string
): Promise<string> => {
    try {
        const ai = await getGeminiAPI();
        if (!ai) {
            return "خدمة الذكاء الاصطناعي غير متاحة حالياً. يرجى تثبيت حزمة @google/genai وتكوين مفتاح API.";
        }
        const prompt = `
أنت الآن "المدير الآلي" لنظام نقاط البيع (POS). اسم المدير الذي يتحدث معك هو "${userName}".
إليك تلخيص لمبيعات اليوم:
- إجمالي المبيعات: ${totalSales} جنيه مصري.
${topItemName ? `- الصنف الأكثر مبيعاً: ${topItemName}.` : ''}
${topCashierName ? `- الكاشير الأفضل أداءً: ${topCashierName}.` : ''}

عليك توجيه رسالة ترحيبية ودودة واحترافية إلى "${userName}"، تشيد فيها بالأداء، وتقدم تعليقاً ذكياً موجزاً عن مدى نجاح هذه الأرقام، واقترح فكرة بسيطة لزيادة المبيعات بناءً على هذه المعطيات. 
الرسالة يجب أن لا تتجاوز 40 كلمة لتناسب لوحة التحكم. تأكد من أن لهجتك مشجعة ومتطورة وموجهة للأعمال.
`;
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });

        return response.text || '';
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "حدث خطأ في الاتصال بالذكاء الاصطناعي، يرجى التأكد من مفتاح الـ API.";
    }
};
