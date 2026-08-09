import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <div className="app-status" role="alert">
      <h1>Page not found</h1>
      <p>The page you're looking for doesn't exist or may have moved.</p>
      <Link to="/" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem' }}>
        Go to Gigboy
      </Link>
    </div>
  );
}
