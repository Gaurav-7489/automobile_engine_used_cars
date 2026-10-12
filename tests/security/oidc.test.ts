import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPair,SignJWT} from "jose";
import {createOidcVerifier} from "../../packages/server-auth/src/index";
test("OIDC verifies signatures, expiry, issuer and a distinct API audience",async()=>{
  const {privateKey,publicKey}=await generateKeyPair("RS256");
  const env={OIDC_ISSUER:"https://identity.example",OIDC_JWKS_URL:"https://identity.example/jwks",OIDC_AUDIENCE:"dealer-api",OIDC_CLIENT_ID:"browser-app"};
  const verify=createOidcVerifier(env,async()=>publicKey);
  const token=async(aud="dealer-api",issuer=env.OIDC_ISSUER,exp:number|string="5m")=>new SignJWT({sub:"staff",token_use:"access"}).setProtectedHeader({alg:"RS256"}).setIssuedAt().setIssuer(issuer).setAudience(aud).setExpirationTime(exp).sign(privateKey);
  assert.deepEqual(await verify(await token()),{sub:"staff"});
  await assert.rejects(verify(await token("browser-app")));
  await assert.rejects(verify(await token("dealer-api","https://evil.example")));
  await assert.rejects(verify(await token("dealer-api",env.OIDC_ISSUER,1)));
  const id=await new SignJWT({sub:"staff",token_use:"id"}).setProtectedHeader({alg:"RS256"}).setIssuedAt().setIssuer(env.OIDC_ISSUER).setAudience("dealer-api").setExpirationTime("5m").sign(privateKey);
  await assert.rejects(verify(id));
  assert.throws(()=>createOidcVerifier({...env,OIDC_AUDIENCE:"browser-app"}),/separate API audience/);
});
