import { useEffect, useRef } from 'react'
const BOLD_BUTTON_LIBRARY_SRC = 'https://checkout.bold.co/library/boldPaymentButton.js'
const BOLD_BUTTON_LIBRARY_ID = 'bold-payment-button-library'
function ensureBoldButtonLibrary({ reload = false } = {}) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(BOLD_BUTTON_LIBRARY_ID)
    if (reload && existing) existing.remove()
    if (!reload && document.getElementById(BOLD_BUTTON_LIBRARY_ID)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = BOLD_BUTTON_LIBRARY_ID
    script.src = BOLD_BUTTON_LIBRARY_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar el boton de Bold'))
    document.head.appendChild(script)
  })
}

function BoldPaymentButton({ config, onError, onPaymentClick }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!config || !containerRef.current) return undefined
    const containerNode = containerRef.current
    let active = true
    let observer = null
    const boundNodes = new Set()
    let clickReported = false
    const handlePaymentClick = () => {
      if (clickReported) return
      clickReported = true
      onPaymentClick?.(config.order_id)
    }
    const bindContainerInteractionHandler = () => {
      if (!containerNode) return
      containerNode.addEventListener('pointerdown', handlePaymentClick, true)
      containerNode.addEventListener('mousedown', handlePaymentClick, true)
      containerNode.addEventListener('click', handlePaymentClick, true)
    }
    const unbindContainerInteractionHandler = () => {
      if (!containerNode) return
      containerNode.removeEventListener('pointerdown', handlePaymentClick, true)
      containerNode.removeEventListener('mousedown', handlePaymentClick, true)
      containerNode.removeEventListener('click', handlePaymentClick, true)
    }
    const bindClickHandler = () => {
      if (!containerRef.current) return false
      const nodes = containerRef.current.querySelectorAll('button, a, [role="button"], iframe')
      if (!nodes.length) return false
      nodes.forEach((node) => {
        if (boundNodes.has(node)) return
        node.addEventListener('pointerdown', handlePaymentClick, { once: true })
        node.addEventListener('mousedown', handlePaymentClick, { once: true })
        node.addEventListener('click', handlePaymentClick, { once: true })
        boundNodes.add(node)
      })
      return true
    }
    const render = async () => {
      try {
        if (!active || !containerRef.current) return
        containerRef.current.innerHTML = ''
        const script = document.createElement('script')
        script.setAttribute('data-bold-button', 'dark-L')
        script.setAttribute('data-api-key', config.api_key)
        script.setAttribute('data-order-id', config.order_id)
        script.setAttribute('data-currency', config.currency)
        script.setAttribute('data-amount', config.amount)
        script.setAttribute('data-integrity-signature', config.integrity_signature)
        script.setAttribute('data-description', config.description)
        script.setAttribute('data-redirection-url', config.redirection_url)
        script.setAttribute('data-render-mode', 'embedded')
        if (config.customer_data) {
          script.setAttribute('data-customer-data', JSON.stringify(config.customer_data))
        }
        containerRef.current.appendChild(script)
        await new Promise((resolve) => window.requestAnimationFrame(resolve))
        await ensureBoldButtonLibrary({ reload: true })
        if (bindClickHandler()) return
        observer = new MutationObserver(() => {
          if (bindClickHandler() && observer) {
            observer.disconnect()
            observer = null
          }
        })
        observer.observe(containerRef.current, { childList: true, subtree: true })
      } catch (err) {
        onError?.(err)
      }
    }
    bindContainerInteractionHandler()
    render()
    return () => {
      active = false
      if (observer) observer.disconnect()
      unbindContainerInteractionHandler()
      boundNodes.forEach((node) => {
        node.removeEventListener('pointerdown', handlePaymentClick)
        node.removeEventListener('mousedown', handlePaymentClick)
        node.removeEventListener('click', handlePaymentClick)
      })
      boundNodes.clear()
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [config, onError, onPaymentClick])

  return <div ref={containerRef} />
}


export default BoldPaymentButton
