// TEMPORARY preview route for the restyle (agent "you"); deleted before handing back.
import { useLocalSearchParams } from 'expo-router';
import Welcome from './welcome';
import Login from './login';
import Setup from './setup';
import SignIn from './sign-in';
import EmailAuth from './email-auth';

export default function Preview() {
  const { s } = useLocalSearchParams<{ s?: string }>();
  if (s === 'login') return <Login />;
  if (s === 'setup') return <Setup />;
  if (s === 'signin') return <SignIn />;
  if (s === 'email') return <EmailAuth />;
  return <Welcome />;
}
