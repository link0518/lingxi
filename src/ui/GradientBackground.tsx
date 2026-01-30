// Imports removed as they were unused

export function GradientBackground() {
    return (
        <div className="fixed inset-0 -z-50 overflow-hidden bg-surface-1">
            {/* 基础环境光 */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[#fdfbfb] via-[#f7f8fc] to-[#fceef6] opacity-60" />

            {/* 极光流动层 1 - 暖调 */}
            <div className="animate-blob absolute -top-[10%] -left-[10%] h-[60vh] w-[60vh] rounded-full bg-[#FFE2E2] mix-blend-multiply blur-[100px] opacity-70 filter" />

            {/* 极光流动层 2 - 冷调互补 */}
            <div className="animate-blob animation-delay-2000 absolute top-[10%] right-[10%] h-[55vh] w-[55vh] rounded-full bg-[#E0E7FF] mix-blend-multiply blur-[100px] opacity-70 filter" />

            {/* 极光流动层 3 - 强调色 */}
            <div className="animate-blob animation-delay-4000 absolute -bottom-[10%] left-[20%] h-[65vh] w-[65vh] rounded-full bg-[#FCE7F3] mix-blend-multiply blur-[100px] opacity-70 filter" />

            {/* 顶部高光 - 增加空气感 */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.8),transparent_50%)]" />
            {/* Noise overlay for texture */}
            <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
        </div>
    );
}
