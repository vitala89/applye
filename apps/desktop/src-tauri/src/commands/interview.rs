//! Tauri IPC adapter for interview stages and prep cards. Workflow and SQL
//! live in `crate::interview`.

use tauri::State;

use crate::db::Db;
use crate::interview::{
    CreateInterviewStageInput, InterviewPrepCard, InterviewStage, SaveInterviewPrepBatchInput,
    UpdateInterviewStageInput,
};

#[tauri::command]
pub async fn create_interview_stage(
    input: CreateInterviewStageInput,
    db: State<'_, Db>,
) -> Result<InterviewStage, String> {
    crate::interview::create_stage(input, &db.pool).await
}

#[tauri::command]
pub async fn update_interview_stage(
    input: UpdateInterviewStageInput,
    db: State<'_, Db>,
) -> Result<InterviewStage, String> {
    crate::interview::update_stage(input, &db.pool).await
}

#[tauri::command]
pub async fn delete_interview_stage(stage_id: i64, db: State<'_, Db>) -> Result<(), String> {
    crate::interview::delete_stage(stage_id, &db.pool).await
}

#[tauri::command]
pub async fn list_interview_stages(
    application_id: i64,
    db: State<'_, Db>,
) -> Result<Vec<InterviewStage>, String> {
    crate::interview::list_stages(application_id, &db.pool).await
}

#[tauri::command]
pub async fn list_interview_prep(
    stage_id: i64,
    db: State<'_, Db>,
) -> Result<Vec<InterviewPrepCard>, String> {
    crate::interview::list_prep(stage_id, &db.pool).await
}

#[tauri::command]
pub async fn save_interview_prep_batch(
    input: SaveInterviewPrepBatchInput,
    db: State<'_, Db>,
) -> Result<Vec<InterviewPrepCard>, String> {
    crate::interview::save_prep_batch(input, &db.pool).await
}
