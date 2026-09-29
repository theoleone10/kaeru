import { LegalPage } from '@/components/LegalPage';
import { termsOfUse } from '@/legal/text';

export default function TermsScreen() {
  return <LegalPage doc={termsOfUse} />;
}
