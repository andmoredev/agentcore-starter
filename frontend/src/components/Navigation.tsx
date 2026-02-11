import { Link } from 'react-router-dom'

function Navigation() {
  return (
    <nav className="navigation">
      <div className="nav-brand">
        <h2>AgentCore Chatbot</h2>
      </div>
      <div className="nav-links">
        <Link to="/" className="nav-link">Home</Link>
        <Link to="/chat" className="nav-link">Chat</Link>
      </div>
    </nav>
  )
}

export default Navigation