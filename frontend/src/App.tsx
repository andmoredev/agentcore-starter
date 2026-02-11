import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './components/Home'
import Chat from './components/Chat'
import './App.css'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/chat/:sessionId?"
          element={
            <div className="interface-container chat-page">
              <div className="interface-content">
                <Chat />
              </div>
            </div>
          }
        />
      </Routes>
    </Layout>
  )
}

export default App