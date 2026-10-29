//! Pure rules for the desktop client: which addresses it may use and which requests it may send. No Tauri or network code lives here,
//! so these rules are unit-tested without a GUI toolchain.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD,Engine};
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use url::Url;
#[derive(Clone,Deserialize,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Config { pub api_origin:String, pub authorize_url:String, pub token_url:String }
fn plain_https(u:&Url)->bool{u.scheme()=="https"&&u.host_str().is_some()&&u.username().is_empty()&&u.password().is_none()&&u.query().is_none()&&u.fragment().is_none()}
pub fn workspace_origin(value:&str)->Result<Url,String>{
 let mut url=Url::parse(value).map_err(|_|"Enter your HTTPS workspace URL.")?;
 if !plain_https(&url)||url.path()!="/"{return Err("Use your HTTPS workspace URL without a path, credentials or query parameters.".into());}
 url.set_path("/");Ok(url)
}
/// Every address the application will talk to must be HTTPS on the one workspace origin.
pub fn validated(c:&Config)->Result<(Url,Url,Url,String),String>{
 let api=workspace_origin(&c.api_origin)?;
 let authorize=Url::parse(&c.authorize_url).map_err(|_|"Invalid sign-in address.")?;
 let token=Url::parse(&c.token_url).map_err(|_|"Invalid sign-in address.")?;
 for u in [&authorize,&token]{if u.scheme()!="https"||u.origin()!=api.origin()||!u.username().is_empty()||u.password().is_some()||u.query().is_some()||u.fragment().is_some(){return Err("Sign-in addresses must be on the workspace origin.".into());}}
 let key=URL_SAFE_NO_PAD.encode(Sha256::digest(format!("{}|{}|{}",api,authorize,token)));
 Ok((api,authorize,token,key))
}
const READABLE:[&str;9]=["/api/workspace","/api/overview","/api/inventory","/api/leads","/api/capital","/api/stock-intelligence","/api/automations","/api/alerts","/api/acquisition"];
/// The desktop may read the platform's page APIs and send workspace commands. Nothing else, and no other host.
pub fn allowed(path:&str,method:&str)->bool{
 let (route,query)=match path.split_once('?'){Some((r,q))=>(r,q),None=>(path,"")};
 if !query.chars().all(|c|c.is_ascii_alphanumeric()||"=&,._%-".contains(c)){return false;}
 if route=="/api/workspace/commands"{return method=="POST"&&query.is_empty();}
 method=="GET"&&READABLE.contains(&route)
}
#[cfg(test)]mod tests{use super::*;
 fn config()->Config{Config{api_origin:"https://dealer.example".into(),authorize_url:"https://dealer.example/desktop/authorize".into(),token_url:"https://dealer.example/api/desktop/token".into()}}
 #[test]fn paths_are_scoped(){
  assert!(allowed("/api/workspace","GET"));assert!(allowed("/api/inventory?page=2&tab=available&q=swift%20vxi","GET"));assert!(allowed("/api/workspace/commands","POST"));
  assert!(!allowed("/api/workspace/commands","GET"));assert!(!allowed("/api/inventory","POST"));assert!(!allowed("/api/admin/audit","GET"));assert!(!allowed("/api/auth/reauth","POST"));
  assert!(!allowed("/api/../admin","GET"));assert!(!allowed("/api/inventory?x=<script>","GET"));assert!(!allowed("//evil.example/api/leads","GET"));assert!(!allowed("/api/workspace/commands?a=b","POST"));
 }
 #[test]fn connection_is_strict(){
  assert!(validated(&config()).is_ok());
  let mut http=config();http.api_origin="http://dealer.example".into();assert!(validated(&http).is_err());
  let mut other=config();other.token_url="https://evil.example/api/desktop/token".into();assert!(validated(&other).is_err());
  let mut query=config();query.authorize_url="https://dealer.example/desktop/authorize?x=1".into();assert!(validated(&query).is_err());
 }
 #[test]fn discovery_origin_is_strict(){
  assert_eq!(workspace_origin("https://dealer.example").unwrap().as_str(),"https://dealer.example/");
  for url in ["http://dealer.example","https://user:pass@dealer.example","https://dealer.example?token=x","https://dealer.example/untrusted"]{assert!(workspace_origin(url).is_err());}
 }
 #[test]fn pkce_challenge_matches_the_server(){
  // RFC 7636 appendix B vector, which the server's challengeOf() is tested against as well.
  let challenge=URL_SAFE_NO_PAD.encode(Sha256::digest("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk".as_bytes()));
  assert_eq!(challenge,"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
 }
}
