import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { WebView } from 'react-native-webview';
import { PGPExecutor } from '../services/pgpCryptoService';
import openpgpScript from '../../assets/pgp/openpgp.bundle.js';
import { useHiddenPgpExecutor } from '../hooks/useHiddenPgpExecutor';
import { logger } from '../utils/logger';

export interface HiddenPGPWebViewRef extends PGPExecutor {
  reload: () => void;
}

interface HiddenPGPWebViewProps {
  onReload?: () => void;
}

const PGP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body>
  <script>
    //<![CDATA[
    ${openpgpScript}
    if (window.__openpgpResolve) {
      window.__openpgpResolve(window.openpgp);
      delete window.__openpgpResolve;
    }
    //]]>
  </script>
  <script>
    function getOpenPGP() {
      if (window.openpgp) return Promise.resolve(window.openpgp);
      return new Promise((res, rej) => {
        window.__openpgpResolve = res;
        setTimeout(() => rej(new Error('OpenPGP load timeout')), 15000);
      });
    }

    function formatExpiry(exp){
      if(!(exp instanceof Date) || isNaN(exp.getTime())) return 'Never expires';
      const now=new Date();
      const dd=String(exp.getDate()).padStart(2,'0');
      const mm=String(exp.getMonth()+1).padStart(2,'0');
      const yyyy=exp.getFullYear();
      const dateStr=\`\${dd}.\${mm}.\${yyyy}\`;
      const diff=exp-now;
      const days = diff >= 0
        ? Math.ceil(diff / (1000*60*60*24))
        : Math.floor(Math.abs(diff) / (1000*60*60*24));
      const span=\`\${days} day\${days!==1?'s':''}\`;
      return diff<0? \`\${dateStr} (expired \${span} ago)\` : \`\${dateStr} (expires in \${span})\`;
    }

    function normalizeUserIds(users) {
      if (!Array.isArray(users) || !users.length) {
        return { display: '', structured: [] };
      }

      const structured = users.map((u, i) => {
        let raw = (u.user && u.user.userID) || u.userID || '';
        let name = '', comment = '', email = '', rawString = '';

        if (raw && typeof raw === 'object') {
          if (raw.name) name = raw.name;
          if (raw.comment) comment = raw.comment;
          if (raw.email) email = raw.email;
          raw = raw.userID || '';
        }

        if (typeof raw === 'string' && raw) {
          rawString = raw.trim();
          let work = rawString;

          const lt = work.lastIndexOf('<');
          const gt = lt !== -1 ? work.indexOf('>', lt + 1) : -1;
          if (lt !== -1 && gt !== -1 && lt < gt) {
            email = work.slice(lt + 1, gt).trim();
            work = (work.slice(0, lt) + work.slice(gt + 1)).trim();
          }

          const open = work.lastIndexOf('(');
          const close = open !== -1 ? work.indexOf(')', open + 1) : -1;
          if (open !== -1 && close !== -1 && open < close) {
            comment = work.slice(open + 1, close).trim();
            work = (work.slice(0, open) + work.slice(close + 1)).trim();
          }

          // Remaining is name
          name = work.trim();
        }

        return { name, comment, email, rawString };
      });

      return { display: structured[0].rawString, structured };
    }

    async function getUnlockedPrivateKey(privateKeyArmored, openpgp, passphrase) {
      const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
      if (!privateKey.isDecrypted()) {
        return openpgp.decryptKey({
          privateKey,
          passphrase,
        });
      }
      return privateKey;
    }

    // Handler
    window.handlePGPOperation = async function({operation,data,id}){
      try{
        const openpgp=await getOpenPGP();
        let result;

        switch(operation){
          case 'ping': {
            result = { pong: true, timestamp: Date.now() };
            break;
          }

          case 'generateKeyPair': {
            let type, rsaBits, curve;
            if(data.algorithm==='RSA'){ type='rsa'; rsaBits=data.bitStrength||3072; }
            else if(data.algorithm==='ECDSA'){ type='ecc'; curve='p256'; }
            else if(data.algorithm==='EDDSA'){ type='ecc'; curve='ed25519'; }
            else throw new Error('Unsupported key type');
            const { privateKey, publicKey } = await openpgp.generateKey({
              type, rsaBits, curve,
              userIDs:[{ name:data.name, email:data.email, comment:data.comment }],
              passphrase:data.passphrase,
              keyExpirationTime:data.days||0,
              format:'armored'
            });
            result={ privateKey, publicKey };
            break;
          }

          case 'encryptMessage': {
            const keys = await Promise.all(
              (data.publicKeys || []).map(k => openpgp.readKey({ armoredKey: k }))
            );

            const msg = await openpgp.createMessage({ text: data.content });

            let signingKey;
            if (data.signOptions) {
              signingKey = await getUnlockedPrivateKey(data.signOptions.privateKey, openpgp, data.signOptions.passphrase);
            }

            let paramsObject = {
              message: msg,
              encryptionKeys: keys,
              format: 'armored'
            };

            if (signingKey) {
              paramsObject.signingKeys = signingKey;
            }

            result = await openpgp.encrypt(paramsObject);

            break;
          }

          case 'decryptMessage': {
            const unlocked = await getUnlockedPrivateKey(data.privateKey, openpgp, data.passphrase);
            const enc = await openpgp.readMessage({ armoredMessage: data.encryptedData });

            const verificationKeys = data.publicKeyForVerification
              ? await openpgp.readKey({ armoredKey: data.publicKeyForVerification })
              : undefined;

            const { data: dec, signatures } = await openpgp.decrypt({
              message: enc,
              decryptionKeys: unlocked,
              verificationKeys
            });

            let verified = null;
            if (verificationKeys && signatures && signatures.length) {
              try {
                await signatures[0].verified;
                verified = true;
              } catch {
                verified = false;
              }
            }

            result = { decrypted: dec.toString(), verified };
            break;
          }

          case 'changePassphrase': {
            const orig = await getUnlockedPrivateKey(data.armoredPrivateKey, openpgp, data.oldPassphrase);
            const re = !data.newPassphrase ? orig : await openpgp.encryptKey({ privateKey: orig, passphrase: data.newPassphrase });
            result = re.armor();
            break;
          }

          case 'extractKeyMetadata': {
            try {
              const key = await openpgp.readKey({ armoredKey: data.armoredKey });
              const fingerprint = key.getFingerprint();

              const { display: userId } = normalizeUserIds(key.users);

              const ai = key.getAlgorithmInfo() || {};
              const algorithm   = ai.algorithm || 'unknown';
              const bitStrength = ai.bits || null;
              const curve       = ai.curve || null;

              let exp = null;
              try {
                const expRaw = await key.getExpirationTime();
                if (typeof expRaw === 'number' && Number.isFinite(expRaw) && expRaw > 0) {
                  exp = new Date(expRaw);
                } else if (expRaw instanceof Date) {
                  exp = expRaw;
                }
              } catch {}
              const expiry = formatExpiry(exp);
              const privateKeyIsUnlocked = typeof key.isDecrypted !== 'function' ? undefined : key.isDecrypted() !== null ? key.isDecrypted() : undefined;
              result = { fingerprint, userId, algorithm, bitStrength, curve, expiry, privateKeyIsUnlocked };
            } catch (err) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ success:false, error: err.message, id }));
              return;
            }
            break;
          }

          case 'changeExpiration': {
            const orig = await getUnlockedPrivateKey(
              data.armoredPrivateKey,
              openpgp,
              data.passphrase
            );

            const { structured: userIDs } = normalizeUserIds(orig.users);

            const days = data.days && !isNaN(data.days.trim())
              ? parseInt(data.days.trim(), 10)
              : undefined;

            let keyExpirationTime;
            if (days !== undefined && days > 0) {
              const now = new Date();
              const desiredExpiry = new Date(now.getTime() + days * 86400 * 1000);
              const creation = orig.keyPacket.created;
              keyExpirationTime = Math.floor((desiredExpiry - creation) / 1000);
            }

            const { privateKey, publicKey } = await openpgp.reformatKey({
              privateKey: orig,
              userIDs,
              passphrase: data.passphrase,
              keyExpirationTime,
              subkeys: orig.subkeys.map(() => ({ keyExpirationTime })),
              date: new Date(),
              format: 'armored',
            });

            result = {
              privateKey,
              publicKey,
            };

            break;
          }

          case 'createDetachedSignature': {
            const unlocked = await getUnlockedPrivateKey(data.privateKey, openpgp, data.passphrase);
            const msg=await openpgp.createMessage({text:data.message});
            result=await openpgp.sign({message:msg,signingKeys:unlocked,detached:true});
            break;
          }

          case 'verifyDetachedSignature': {
            const pub = await openpgp.readKey({ armoredKey: data.publicKey });
            const msg = await openpgp.createMessage({ text: data.message });
            const sig = await openpgp.readSignature({ armoredSignature: data.signature });
            const vr = await openpgp.verify({
              message: msg,
              signature: sig,
              verificationKeys: pub
            });
            try { await vr.signatures[0].verified; result = true; }
            catch { result = false; }
            break;
          }

          case 'validatePrivateKeyPassphrase': {
            try {
              const pk = await openpgp.readPrivateKey({ armoredKey: data.privateKey });
              if (!pk.isDecrypted()) {
                if (!data.passphrase) throw new Error('validatePrivateKeyPassphrase: Passphrase required to decrypt private key');
                await openpgp.decryptKey({ privateKey: pk, passphrase: data.passphrase });
              }
              result = true;
            } catch {
              result = false;
            }
            break;
          }

          case 'extractPublicKeyFromPrivate': {
            const pk = await openpgp.readPrivateKey({ armoredKey: data.privateKey });
            result = pk.toPublic().armor();
            break;
          }

          default:
            throw new Error('Unknown operation: ' + operation);
        }

        window.ReactNativeWebView.postMessage(JSON.stringify({ success: true, result, id }));
      } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ success: false, error: err.message, id }));
      }
    };

  </script>
</body>
</html>
`;

const HiddenPGPWebView = forwardRef<HiddenPGPWebViewRef, HiddenPGPWebViewProps>(({ onReload }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const { executePGPOperation, reload, onMessage } = useHiddenPgpExecutor(webViewRef);

  useImperativeHandle(ref, () => ({ executePGPOperation, reload }));

  return (
    <WebView
      ref={webViewRef}
      source={{ html: PGP_HTML }}
      style={{ width: 1, height: 1, opacity: 0.01 }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      onMessage={onMessage}
      onError={error => logger.warn('pgp webview error', { error: error.nativeEvent })}
      onLoadEnd={() => {
        // Notify parent that WebView reloaded
        if (onReload) {
          onReload();
        }
      }}
      pointerEvents="none"
      androidLayerType="software"
      renderToHardwareTextureAndroid={false}
    />
  );
});

export default HiddenPGPWebView;
