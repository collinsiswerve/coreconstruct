import { ArrowRight, LockKeyhole } from 'lucide-react';
import { AccountSignOut } from './account-sign-out';
import './sign-in.css';

export function SignInScreen({ state, image, signInHref, continueHref, invitation }: {
  state: 'sign-in' | 'welcome' | 'invitation-required';
  image: string;
  signInHref?: string;
  continueHref?: string;
  invitation?: boolean;
}) {
  const signingIn = state === 'sign-in';
  const blocked = state === 'invitation-required';
  const title = signingIn ? 'Sign in to CoreConstruct' : blocked ? 'Invitation required' : 'You’re signed in';
  const description = signingIn
    ? 'Use the ChatGPT account connected to the email address your firm invited.'
    : blocked ? 'This account needs an invitation to open a firm workspace.'
      : 'Open the workspace to see the projects and records your firm has assigned to you.';

  return <main className="signin-layout">
    <div className="signin-main">
      <div className="signin-brand">
        <span aria-hidden="true" className="signin-brand-mark"><i /><i /><i /></span>
        <span>Core<span>Construct</span></span>
      </div>
      <section className="signin-content" aria-labelledby="signin-title">
        <div className="signin-access"><LockKeyhole size={14} aria-hidden="true" /> Private workspace</div>
        <h1 id="signin-title">{title}</h1>
        <p>{description}</p>
        {signingIn && <a href={signInHref} target="_top" referrerPolicy="no-referrer" className="signin-primary">
          Continue with ChatGPT <ArrowRight size={18} aria-hidden="true" />
        </a>}
        {state === 'welcome' && <a href={continueHref} className="signin-primary">
          {invitation ? 'Open invitation' : 'Open workspace'} <ArrowRight size={18} aria-hidden="true" />
        </a>}
        {!signingIn && <AccountSignOut returnTo={invitation ? continueHref : undefined} className={blocked ? 'signin-primary' : 'signin-plain'}>
          {blocked ? 'Sign out to switch accounts' : 'Sign out'}
        </AccountSignOut>}
        {state !== 'welcome' && <div className="signin-help">
          <h2>{invitation ? 'Already have an invitation?' : 'Need access?'}</h2>
          <p>{invitation ? 'Continue with the account your firm invited to accept the project invitation.'
            : 'Ask your firm principal for an invitation, then open the link they share with you.'}</p>
        </div>}
      </section>
    </div>
    <div className="signin-visual" aria-hidden="true"><img src={image} alt="" /></div>
  </main>;
}
