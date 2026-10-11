"""Optional offline waiting-time experiment. Synthetic data; not clinically validated.
Run: python ml/train.py --output ml/output
Features are information available at prediction time. Holdout is chronological.
The web app always uses its explainable baseline, not this experimental model.
"""
import argparse, json
from pathlib import Path
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
import joblib

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='ml/output');args=parser.parse_args()
    rng=np.random.default_rng(42);n=2400
    ahead=rng.integers(0,16,n);historical_avg=rng.uniform(8,20,n);remaining=rng.uniform(0,15,n);pause=rng.choice([0,0,0,10,15],n)
    baseline=ahead*historical_avg+remaining+pause
    # A synthetic arrival-time trend and duration uncertainty, not real hospital observations.
    target=np.maximum(0,baseline*(1+.08*np.sin(np.arange(n)/70))+rng.normal(0,8,n))
    x=np.column_stack([ahead,historical_avg,remaining,pause]);cut=int(n*.8)
    model=RandomForestRegressor(n_estimators=100,min_samples_leaf=8,random_state=42,n_jobs=-1)
    model.fit(x[:cut],target[:cut]);prediction=model.predict(x[cut:]);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    report={'data':'synthetic, seed 42; no clinical validity','rows':n,'train_rows':cut,'holdout_rows':n-cut,'split':'chronological last 20%','features':['patients_ahead','historical_avg_minutes','active_remaining_minutes','break_remaining_minutes'],'baseline_mae_minutes':float(mean_absolute_error(target[cut:],baseline[cut:])),'model_mae_minutes':float(mean_absolute_error(target[cut:],prediction)),'deployment':'offline experiment only; web application retains baseline'}
    joblib.dump(model,out/'waiting-model.joblib');(out/'evaluation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if __name__=='__main__':main()
