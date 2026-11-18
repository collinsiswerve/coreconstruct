import { createRoot } from 'react-dom/client';
import { SignInScreen } from '../../app/sign-in-screen';
import { chatGPTSignInPath, privatePilotOrigin } from '../../lib/auth-navigation';

import '../../app/site-ultra.css';

const signInHref = privatePilotOrigin + chatGPTSignInPath();
createRoot(document.getElementById('signin')!).render(
  <SignInScreen state="sign-in" signInHref={signInHref} image="../samples/portfolio/m6-09/concept.jpg" />,
);
