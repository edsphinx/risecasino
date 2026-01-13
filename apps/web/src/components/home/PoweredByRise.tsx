/**
 * PoweredByRise - Showcase Rise Chain technology
 * Highlights the Rise tech stack used in VyreCasino
 */


interface TechFeature {
  icon: string;
  name: string;
  value: string;
  description: string;
}

const RISE_TECH: TechFeature[] = [
  {
    icon: '⚡',
    name: 'Shreds',
    value: '3ms',
    description: 'Instant confirmations',
  },
  {
    icon: '🎲',
    name: 'Fast VRF',
    value: '5ms',
    description: 'Verifiable randomness',
  },
  {
    icon: '🔐',
    name: 'Rise Wallet',
    value: 'Passkey',
    description: 'No seed phrases',
  },
  {
    icon: '🚀',
    name: 'Session Keys',
    value: 'Gasless',
    description: 'No popups',
  },
];

export function PoweredByRise() {
  return (
    <section className="powered-by-rise">
      <div className="rise-header">
        <span className="rise-badge">POWERED BY</span>
        <h3 className="rise-title">
          <span className="rise-logo">RISE</span> Chain
        </h3>
        <p className="rise-subtitle">The fastest EVM blockchain</p>
      </div>

      <div className="rise-tech-grid">
        {RISE_TECH.map((tech) => (
          <div key={tech.name} className="tech-card">
            <span className="tech-icon">{tech.icon}</span>
            <div className="tech-info">
              <span className="tech-name">{tech.name}</span>
              <span className="tech-value">{tech.value}</span>
            </div>
            <span className="tech-desc">{tech.description}</span>
          </div>
        ))}
      </div>

      <a
        href="https://docs.risechain.com"
        target="_blank"
        rel="noopener noreferrer"
        className="rise-docs-link"
      >
        Learn more about Rise →
      </a>
    </section>
  );
}
