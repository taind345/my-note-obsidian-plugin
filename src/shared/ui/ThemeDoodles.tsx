/**
 * Doodles trang trí cho theme Pastel "Better Notes" — dùng asset thật trong
 * public/doodles (tách từ demo/theme1): núi + mặt trời, mây mưa, quote,
 * hoa, slogan viết tay. Chỉ render khi theme pastel bật (pointer-events none).
 */
export function ThemeDoodles() {
  return (
    <div className="pastel-doodles" aria-hidden="true">
      {/* Mây mưa góc trái-trên */}
      <img className="pastel-doodle doodle-cloud" src="/doodles/rain-cloud.png" alt="" draggable={false} />

      {/* Cây + quote chữ góc trái-dưới (dùng chữ HTML để không bị nền trắng) */}
      <img
        className="pastel-doodle doodle-plant-quote"
        src="/doodles/plant-quote.png"
        alt=""
        draggable={false}
      />
      <div className="pastel-doodle doodle-quote-text">
        Small steps
        <br />
        make big progress ♡
      </div>

      {/* Hoa trang trí gần slogan */}
      <img className="pastel-doodle doodle-flower" src="/doodles/flower.png" alt="" draggable={false} />

      {/* Sparkles lấp lánh */}
      <svg className="pastel-doodle doodle-sparkles" viewBox="0 0 60 60" fill="none">
        <path
          d="M45 8 l2.2 5.8 5.8 2.2 -5.8 2.2 -2.2 5.8 -2.2 -5.8 -5.8 -2.2 5.8 -2.2 Z"
          stroke="#8b9bf5"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M18 34 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6 Z"
          stroke="#aab6f7"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="48" cy="44" r="2.4" fill="#c3ccfa" />
      </svg>

      {/* Slogan */}
      <div className="pastel-doodle slogan-br">
        Better
        <br />
        Notes
        <br />
        Better
        <br />
        You ♡
      </div>
    </div>
  )
}
