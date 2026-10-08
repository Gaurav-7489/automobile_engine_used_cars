#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{sync::Mutex,time::{Duration,SystemTime,UNIX_EPOCH}};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD,Engine};
use rand::RngCore;
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use tauri::State;
use url::Url;
#[derive(Clone,Deserialize,Serialize)]
#[serde(rename_all="camelCase")]
struct Config { api_origin:String, cognito_domain:String, client_id:String }
#[derive(Clone)]
struct Session { key:String, access:String, expires:u64 }
#[derive(Default)]
struct AppState { session:Mutex<Option<Session>>, login:Mutex<bool> }
#[derive(Deserialize)]
struct Tokens { access_token:String,refresh_token:Option<String>,expires_in:u64 }
fn now()->u64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()}
fn client()->Result<reqwest::Client,String>{reqwest::Client::builder().timeout(Duration::from_secs(15)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Network client unavailable.".into())}
fn validated(c:&Config)->Result<(Url,Url,String),String>{
 let api=Url::parse(&c.api_origin).map_err(|_|"Invalid API origin.")?;
 let domain=Url::parse(&c.cognito_domain).map_err(|_|"Invalid sign-in domain.")?;
 for u in [&api,&domain]{if u.scheme()!="https"||u.host_str().is_none()||!u.username().is_empty()||u.password().is_some()||u.query().is_some()||u.fragment().is_some()||u.path()!="/"{return Err("Use an HTTPS origin without a path, query or credentials.".into());}}
 if c.client_id.is_empty(){return Err("Desktop client ID is required.".into());}
 let key=URL_SAFE_NO_PAD.encode(Sha256::digest(format!("{}|{}|{}",api,domain,c.client_id)));
 Ok((api,domain,key))
}
fn credential(key:&str)->Result<keyring::Entry,String>{keyring::Entry::new("VandLabs Automobile Engine",key).map_err(|_|"Secure credential store unavailable.".into())}
async fn exchange(c:&Config,params:Vec<(&str,String)>)->Result<Tokens,String>{
 let (_,domain,_)=validated(c)?;let mut form=vec![("client_id",c.client_id.clone())];form.extend(params);
 let response=client()?.post(domain.join("oauth2/token").map_err(|_|"Invalid domain.")?).form(&form).send().await.map_err(|_|"Could not reach sign-in service.")?;
 if !response.status().is_success(){return Err("Sign-in expired or was rejected. Sign in again.".into());}
 let tokens:Tokens=response.json().await.map_err(|_|"Invalid sign-in response.")?;
 if tokens.access_token.is_empty()||tokens.expires_in==0||tokens.expires_in>86400{return Err("Invalid sign-in response.".into());}Ok(tokens)
}
async fn accept(c:&Config,t:Tokens,state:&AppState)->Result<(),String>{
 let(api,_,key)=validated(c)?;
 let response=client()?.get(api.join("command/api/snapshot").map_err(|_|"Invalid API origin.")?).bearer_auth(&t.access_token).send().await.map_err(|_|"Could not reach dealership API.")?;
 if !response.status().is_success(){return Err("This account cannot access the dealership workspace.".into());}
 if let Some(refresh)=t.refresh_token{credential(&key)?.set_password(&refresh).map_err(|_|"Could not securely store session.")?;}
 *state.session.lock().map_err(|_|"Session unavailable.")?=Some(Session{key,access:t.access_token,expires:now()+t.expires_in});Ok(())
}
fn nonce()->String{let mut b=[0u8;32];rand::thread_rng().fill_bytes(&mut b);URL_SAFE_NO_PAD.encode(b)}
#[tauri::command]
async fn login(config:Config,state:State<'_,AppState>)->Result<(),String>{
 {let mut active=state.login.lock().map_err(|_|"Sign-in unavailable.")?;if *active{return Err("Sign-in is already open.".into());}*active=true;}
 let result=async{
  let(_,domain,_)=validated(&config)?;let verifier=nonce();let expected=nonce();let challenge=URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
  let mut url=domain.join("oauth2/authorize").map_err(|_|"Invalid domain.")?;
  url.query_pairs_mut().extend_pairs([("response_type","code"),("client_id",&config.client_id),("redirect_uri","http://localhost:43821/callback"),("scope","openid email profile"),("state",&expected),("code_challenge_method","S256"),("code_challenge",&challenge)]);
  let code=tauri::async_runtime::spawn_blocking(move||->Result<String,String>{
   let server=tiny_http::Server::http("127.0.0.1:43821").map_err(|_|"The desktop sign-in port is busy. Close the other sign-in window and retry.")?;
   open::that(url.as_str()).map_err(|_|"Could not open the system browser.")?;
   let deadline=std::time::Instant::now()+Duration::from_secs(180);
   while std::time::Instant::now()<deadline{
    if let Some(request)=server.recv_timeout(Duration::from_secs(1)).map_err(|_|"Sign-in listener failed.")?{
     let callback=Url::parse(&format!("http://localhost:43821{}",request.url())).map_err(|_|"Invalid callback.")?;
     let values:std::collections::HashMap<_,_>=callback.query_pairs().into_owned().collect();
     if callback.path()!="/callback"||values.get("state")!=Some(&expected){let _=request.respond(tiny_http::Response::from_string("Invalid sign-in request.").with_status_code(400));continue;}
     let code=values.get("code").cloned();let _=request.respond(tiny_http::Response::from_string("You can return to Automobile Engine."));return code.ok_or_else(||"Sign-in was cancelled or rejected.".into());
    }
   }Err("Sign-in timed out. Please try again.".into())
  }).await.map_err(|_|"Sign-in listener failed.")??;
  let tokens=exchange(&config,vec![("grant_type","authorization_code".into()),("code",code),("code_verifier",verifier),("redirect_uri","http://localhost:43821/callback".into())]).await?;
  accept(&config,tokens,&state).await
 }.await;
 if let Ok(mut active)=state.login.lock(){*active=false;}result
}
#[tauri::command]
async fn restore_session(config:Config,state:State<'_,AppState>)->Result<(),String>{
 let(_,_,key)=validated(&config)?;let refresh=credential(&key)?.get_password().map_err(|_|"Sign in to connect your workspace.")?;
 let tokens=exchange(&config,vec![("grant_type","refresh_token".into()),("refresh_token",refresh)]).await?;accept(&config,tokens,&state).await
}
#[tauri::command]
async fn logout(config:Config,state:State<'_,AppState>)->Result<(),String>{
 let(_,domain,key)=validated(&config)?;let entry=credential(&key)?;
 if let Ok(refresh)=entry.get_password(){let _=client()?.post(domain.join("oauth2/revoke").map_err(|_|"Invalid domain.")?).form(&[("client_id",config.client_id.clone()),("token",refresh)]).send().await;}
 let _=entry.delete_credential();*state.session.lock().map_err(|_|"Session unavailable.")?=None;Ok(())
}
fn allowed(path:&str,method:&str)->bool{
 if path=="/snapshot"{return method=="GET";}
 let parts:Vec<_>=path.split('/').collect();if parts.len()<3||parts[0]!=""||parts[2].is_empty()||!parts[2].chars().all(|c|c.is_ascii_alphanumeric()||c=='-'){return false;}
 (parts.len()==4&&parts[1]=="vehicles"&&parts[3]=="costs"&&method=="PUT")||(parts.len()==3&&method=="PATCH"&&["leads","tasks","vehicles","appointments"].contains(&parts[1]))||(parts.len()==4&&parts[1]=="leads"&&["tasks","appointments","sales"].contains(&parts[3])&&method=="POST")
}
#[tauri::command]
async fn api_request(config:Config,path:String,method:String,body:Option<serde_json::Value>,state:State<'_,AppState>)->Result<serde_json::Value,String>{
 if !allowed(&path,&method){return Err("Unsupported operation.".into());}let(api,_,key)=validated(&config)?;
 let expired={let session=state.session.lock().map_err(|_|"Session unavailable.")?;session.as_ref().map(|s|s.key!=key||s.expires<=now()+30).unwrap_or(true)};
 if expired{restore_session(config.clone(),state.clone()).await?;}
 let access=state.session.lock().map_err(|_|"Session unavailable.")?.as_ref().ok_or("Sign in first.")?.access.clone();
 let method=reqwest::Method::from_bytes(method.as_bytes()).map_err(|_|"Invalid operation.")?;
 let mut request=client()?.request(method,api.join(&format!("command/api{}",path)).map_err(|_|"Invalid operation.")?).bearer_auth(access);
 if let Some(value)=body{request=request.json(&value);}
 let response=request.send().await.map_err(|_|"Could not reach your dealership. Check your connection and retry.")?;
 if !response.status().is_success(){return Err(match response.status().as_u16(){401=>"Your session expired. Sign in again.",403=>"Your account does not have permission for this operation.",404=>"This record is no longer available.",_=>"The operation could not be completed."}.into());}
 response.json().await.map_err(|_|"Invalid response from dealership API.".into())
}
fn main(){tauri::Builder::default().manage(AppState::default()).invoke_handler(tauri::generate_handler![login,restore_session,logout,api_request]).run(tauri::generate_context!()).expect("Desktop startup failed.");}
#[cfg(test)]mod tests{use super::*;#[test]fn paths_are_scoped(){assert!(allowed("/snapshot","GET"));assert!(allowed("/vehicles/abc-123/costs","PUT"));assert!(!allowed("/vehicles/abc-123/costs","DELETE"));assert!(!allowed("/vehicles/abc-123/costs","POST"));assert!(allowed("/leads/abc-123/tasks","POST"));assert!(allowed("/leads/abc-123/sales","POST"));assert!(allowed("/leads/abc-123/appointments","POST"));assert!(allowed("/appointments/abc-123","PATCH"));assert!(!allowed("/leads/abc-123/sales","DELETE"));assert!(!allowed("/../platform","GET"));assert!(!allowed("/vehicles/abc?token=secret","PATCH"));}#[test]fn credentials_are_bound_to_connection(){let c=Config{api_origin:"https://dealer.example".into(),cognito_domain:"https://auth.example".into(),client_id:"abc".into()};assert!(validated(&c).is_ok());let mut bad=c.clone();bad.api_origin="http://dealer.example".into();assert!(validated(&bad).is_err());}}
