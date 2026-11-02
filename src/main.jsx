import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import WaveGD from './WaveGD.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WaveGD />
  </StrictMode>,
)
