// src/components/layout/Topbar.tsx

import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TopbarTitle } from './TopbarTitle';
import { TopbarActions } from './TopbarActions';
import { PeriodBadge } from './PeriodBar';
import styles from './Topbar.module.css';

export async function Topbar() {
  const cookieName  = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token       = cookieStore.get(cookieName)?.value ?? '';
  const session     = token ? await verifyToken(token) : null;

  if (!session) return null;

  const user     = await prisma.user.findUnique({
    where:  { id: session.sub },
    select: { username: true },
  });
  const username = user?.username ?? 'User';
  const role     = session.role ?? '';

  function btnClass(...variants: string[]): string {
    return [styles.btn, ...variants.map((v) => styles[v])].join(' ');
  }

  return (
    <header className={styles.topbar}>
      <div className={styles['tb-l']}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.jpg"
          alt="MehmanGhar"
          width={34}
          height={34}
          className={styles['tb-logo']}
        />
        <TopbarTitle />
        <span className={styles['tb-badge']}><PeriodBadge /></span>
      </div>

      <div className={styles['tb-r']}>
        <TopbarActions role={role} />
        <button
          type="button"
          className={btnClass('btn-g', 'btn-sm')}
          title="Logged in as"
        >
          👤 {username}
        </button>
      </div>
    </header>
  );
}