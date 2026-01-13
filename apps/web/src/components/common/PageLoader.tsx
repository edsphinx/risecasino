/**
 * PageLoader - Minimalist page transition loader
 * Matches AppLoader style for unified experience
 */


export function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader-glow" />
      <div className="page-loader-content">
        {/* Simple pulsing dot */}
        <div className="page-loader-dots">
          <span className="loader-dot" />
          <span className="loader-dot" />
          <span className="loader-dot" />
        </div>
        <p className="page-loader-text">Loading...</p>
      </div>
    </div>
  );
}
