#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{sync::Mutex,time::{Duration,SystemTime,UNIX_EPOCH}};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD,Engine};
use rand::RngCore;
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use tauri::State;
use url::Url;
mod rules;
use rules::{allowed,validated,workspace_origin,Config};

// The desktop application is a client of the same private platform as the web application: same accounts, MFA, roles, branch scope,
// entitlements and APIs. It signs in through the system browser (authorization code with PKCE) and sends the resulting session as a bearer
// token. The only things it keeps are that token and its expiry, in the operating system's credential store.
#[derive(Clone)]
struct Session { key:String, access:String, expires:u64 }
#[derive(Default)]
struct AppState { session:Mutex<Option<Session>>, login:Mutex<bool> }
#[derive(Deserialize)]
struct Tokens { access_token:String,expires_in:u64 }
#[derive(Serialize,Deserialize)]
struct Stored { access:String, expires:u64 }
fn now()->u64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()}
fn client()->Result<reqwest::Client,String>{reqwest::Client::builder().timeout(Duration::from_secs(15)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Network client unavailable.".into())}
#[tauri::command]
async fn discover_connection(origin:String)->Result<Config,String>{
 let api=workspace_origin(&origin)?;
 let response=client()?.get(api.join("api/desktop/config").map_err(|_|"Invalid workspace URL.")?).send().await.map_err(|_|"Could not reach this workspace. Check the URL and your connection.")?;
 if !response.status().is_success(){return Err("Desktop access is not activated for this workspace. Contact your administrator.".into());}
 if response.content_length().unwrap_or(0)>8192{return Err("Invalid workspace configuration.".into());}
 let mut bytes=Vec::new();let mut response=response;
 while let Some(chunk)=response.chunk().await.map_err(|_|"Invalid workspace configuration.")?{if bytes.len()+chunk.len()>8192{return Err("Invalid workspace configuration.".into());}bytes.extend_from_slice(&chunk);}
 let config:Config=serde_json::from_slice(&bytes).map_err(|_|"Invalid workspace configuration.")?;
 let (configured,_,_,_)=validated(&config)?;
 if configured!=api{return Err("Workspace configuration does not match the requested URL.".into());}
 Ok(config)
}
fn credential(key:&str)->Result<keyring::Entry,String>{keyring::Entry::new("VandLabs Automobile Engine",key).map_err(|_|"Secure credential store unavailable.".into())}
fn nonce()->String{let mut b=[0u8;32];rand::thread_rng().fill_bytes(&mut b);URL_SAFE_NO_PAD.encode(b)}
async fn accept(c:&Config,t:Tokens,state:&AppState)->Result<(),String>{
 let(api,_,_,key)=validated(c)?;
 if t.access_token.is_empty()||t.expires_in==0||t.expires_in>86400{return Err("Invalid sign-in response.".into());}
 let response=client()?.get(api.join("api/workspace").map_err(|_|"Invalid API origin.")?).bearer_auth(&t.access_token).send().await.map_err(|_|"Could not reach your dealership.")?;
 if !response.status().is_success(){return Err("This account cannot access the dealership workspace.".into());}
 let expires=now()+t.expires_in;
 let stored=serde_json::to_string(&Stored{access:t.access_token.clone(),expires}).map_err(|_|"Could not store session.")?;
 credential(&key)?.set_password(&stored).map_err(|_|"Could not securely store session.")?;
 *state.session.lock().map_err(|_|"Session unavailable.")?=Some(Session{key,access:t.access_token,expires});Ok(())
}
#[tauri::command]
async fn login(config:Config,state:State<'_,AppState>)->Result<(),String>{
 {let mut active=state.login.lock().map_err(|_|"Sign-in unavailable.")?;if *active{return Err("Sign-in is already open.".into());}*active=true;}
 let result=async{
  let(_,authorize,token_url,_)=validated(&config)?;let verifier=nonce();let expected=nonce();let challenge=URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
  let mut url=authorize.clone();
  url.query_pairs_mut().extend_pairs([("challenge",challenge.as_str()),("state",expected.as_str())]);
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
  let response=client()?.post(token_url).json(&serde_json::json!({"grant_type":"authorization_code","code":code,"code_verifier":verifier})).send().await.map_err(|_|"Could not reach sign-in service.")?;
  if !response.status().is_success(){return Err(if response.status().as_u16()==403{"Your dealership has not enabled the desktop application for this account."}else{"Sign-in expired or was rejected. Sign in again."}.into());}
  let tokens:Tokens=response.json().await.map_err(|_|"Invalid sign-in response.")?;
  accept(&config,tokens,&state).await
 }.await;
 if let Ok(mut active)=state.login.lock(){*active=false;}result
}
/// A saved session is reused until it expires; after that the person signs in again through the browser.
#[tauri::command]
async fn restore_session(config:Config,state:State<'_,AppState>)->Result<(),String>{
 let(_,_,_,key)=validated(&config)?;let saved=credential(&key)?.get_password().map_err(|_|"Sign in to connect your workspace.")?;
 let stored:Stored=serde_json::from_str(&saved).map_err(|_|"Sign in to connect your workspace.")?;
 if stored.expires<=now()+60{let _=credential(&key)?.delete_credential();return Err("Your session expired. Sign in again.".into());}
 *state.session.lock().map_err(|_|"Session unavailable.")?=Some(Session{key,access:stored.access,expires:stored.expires});Ok(())
}
#[tauri::command]
async fn logout(config:Config,state:State<'_,AppState>)->Result<(),String>{
 let(_,_,_,key)=validated(&config)?;let _=credential(&key)?.delete_credential();*state.session.lock().map_err(|_|"Session unavailable.")?=None;Ok(())
}
#[tauri::command]
async fn api_request(config:Config,path:String,method:String,body:Option<serde_json::Value>,state:State<'_,AppState>)->Result<serde_json::Value,String>{
 if !allowed(&path,&method){return Err("Unsupported operation.".into());}let(api,_,_,key)=validated(&config)?;
 let access={let session=state.session.lock().map_err(|_|"Session unavailable.")?;match session.as_ref(){Some(s)if s.key==key&&s.expires>now()+30=>s.access.clone(),_=>return Err("Your session expired. Sign in again.".into())}};
 let method=reqwest::Method::from_bytes(method.as_bytes()).map_err(|_|"Invalid operation.")?;
 let mut request=client()?.request(method,api.join(path.trim_start_matches('/')).map_err(|_|"Invalid operation.")?).bearer_auth(access);
 if let Some(value)=body{request=request.json(&value);}
 let response=request.send().await.map_err(|_|"Could not reach your dealership. Check your connection and retry.")?;
 let status=response.status();
 let json:serde_json::Value=response.json().await.unwrap_or(serde_json::Value::Null);
 if !status.is_success(){
  let message=json.pointer("/error/message").and_then(|m|m.as_str()).map(|m|m.to_string());
  return Err(message.unwrap_or_else(||match status.as_u16(){401=>"Your session expired. Sign in again.",403=>"Your account does not have permission for this operation.",404=>"This record is no longer available.",429=>"Too many requests. Wait a moment and retry.",_=>"The operation could not be completed."}.into()));
 }
 Ok(json)
}
fn main(){tauri::Builder::default().manage(AppState::default()).invoke_handler(tauri::generate_handler![login,restore_session,logout,api_request,discover_connection]).run(tauri::generate_context!()).expect("Desktop startup failed.");}
