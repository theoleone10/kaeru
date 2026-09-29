import { LegalPage } from '@/components/LegalPage';
import { privacyPolicy } from '@/legal/text';

export default function PrivacyScreen() {
  return <LegalPage doc={privacyPolicy} />;
}
