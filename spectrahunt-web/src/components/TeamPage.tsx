'use client';

import Icon from '@/components/Icon';

interface Member {
  name: string;
  initials: string;
  role: string;
  web?: string;
  github?: string;
  email?: string;
}

const TEAM: Member[] = [
  {
    name: 'Himel Das', initials: 'HD', role: 'Team Lead · Systems Architect · Lead Developer',
    web: 'https://hello2himel.netlify.app', github: 'https://github.com/hello2himel',
    email: 'das.himel.bd@gmail.com',
  },
  {
    name: 'Zubayer Hasan Shaad', initials: 'ZS', role: 'Tech Lead',
    github: 'https://github.com/zabdax', email: 'mdzubayerhasanshaad99@gmail.com',
  },
  {
    name: 'Md Hedayet Ullah', initials: 'HU', role: 'Researcher',
    email: 'mdkhansaikat@gmail.com',
  },
  {
    name: 'Md Mahdin Al Abrar', initials: 'MA', role: 'Communications Lead',
    email: 'mdmahdin.alabrar@gmail.com',
  },
  {
    name: 'Aazmaine Alif Abrar', initials: 'AA', role: 'Quality Analyst',
    email: 'aazmaine.abrar@gmail.com',
  },
  {
    name: 'Suraiya Ratry Orni', initials: 'SO', role: 'Science Review · Communications',
    email: 'suraiyaratryorni@gmail.com',
  },
];

function contactLabel(href: string, fallback: string): string {
  return href.replace(/^https?:\/\//, '').replace(/\/$/, '') || fallback;
}

/** Team AKASHTORI: the crew behind STELLAR. Photos slot into the monograms. */
export default function TeamPage() {
  return (
    <div className="prose" style={{ position: 'relative', zIndex: 1 }}>
      <p className="hero-kicker">Team AKASHTORI · NASA Space Apps Challenge 2026</p>
      <h1>The crew behind STELLAR</h1>
      <p className="lede">
        Six people, one infrared sky. We design the system, measure the fields,
        check the science, and tell the story — so anyone can hunt what moves.
      </p>
      <div className="team-grid">
        {TEAM.map((m) => (
          <article key={m.email} className="team-card glass">
            <span className="team-photo" aria-hidden="true">{m.initials}</span>
            <h2>{m.name}</h2>
            <p className="team-role">{m.role}</p>
            <div className="team-links" role="group" aria-label={`Contact ${m.name}`}>
              {m.web && (
                <a href={m.web} target="_blank" rel="noreferrer"
                  aria-label={`Website: ${contactLabel(m.web, 'website')}`}
                  title={contactLabel(m.web, 'Website')}>
                  <Icon name="globe" className="icon" />
                </a>
              )}
              {m.github && (
                <a href={m.github} target="_blank" rel="noreferrer"
                  aria-label={`GitHub: ${contactLabel(m.github, 'GitHub')}`}
                  title={contactLabel(m.github, 'GitHub')}>
                  <Icon name="code" className="icon" />
                </a>
              )}
              {m.email && (
                <a href={`mailto:${m.email}`} aria-label={`Email: ${m.email}`} title={m.email}>
                  <Icon name="mail" className="icon" />
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
