import { useEffect } from 'react'
import { useWallet } from '../near/WalletContext'
import { Icon } from './Icon'

export function WalletConnectDialog() {
  const { walletModalOpen, closeWalletModal, connectWallet, connectingWalletId, wallets, error, networkId } = useWallet()

  useEffect(() => {
    if (!walletModalOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWalletModal()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [walletModalOpen, closeWalletModal])

  if (!walletModalOpen) return null

  return <div className="wallet-dialog-layer" role="presentation">
    <button className="wallet-dialog-scrim" onClick={closeWalletModal} aria-label="Close wallet chooser"/>
    <section className="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title">
      <div className="wallet-dialog-header">
        <div><span className="eyebrow">NEAR {networkId}</span><h2 id="wallet-dialog-title">Choose a wallet</h2><p>Forge connects directly through the selected Wallet Selector adapter.</p></div>
        <button className="icon-button" onClick={closeWalletModal} aria-label="Close wallet chooser"><Icon name="close"/></button>
      </div>
      {error && <div className="notice error"><Icon name="alert"/><span><strong>Wallet connection</strong>{error}</span></div>}
      <div className="wallet-choice-list">
        {wallets.map((wallet) => {
          const connecting = connectingWalletId === wallet.id
          return <div className="wallet-choice" key={wallet.id} data-wallet-id={wallet.id}>
            <img src={wallet.iconUrl} alt=""/>
            <div className="wallet-choice-copy"><strong>{wallet.name}</strong><span>{wallet.description}</span><small>{wallet.available ? 'Ready to connect' : 'Browser extension not detected'}</small></div>
            {wallet.available
              ? <button className="button secondary compact" disabled={Boolean(connectingWalletId)} onClick={() => void connectWallet(wallet.id)}>{connecting ? 'Opening…' : 'Connect'}</button>
              : wallet.downloadUrl
                ? <a className="button secondary compact" href={wallet.downloadUrl} target="_blank" rel="noreferrer">Install <Icon name="external"/></a>
                : <span className="badge">Unavailable</span>}
          </div>
        })}
      </div>
      <div className="wallet-dialog-foot"><Icon name="shield"/><span>Testnet only. Forge never receives your private keys or seed phrase.</span></div>
    </section>
  </div>
}
