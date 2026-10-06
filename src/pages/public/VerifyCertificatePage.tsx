// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { siteConfig } from '@/lib/siteConfig';
import { BadgeCheck, CircleX, Loader2 } from 'lucide-react';

export default function VerifyCertificatePage(){
  const { token }=useParams<{token:string}>();
  const {data,isLoading}=useQuery({queryKey:['verify-certificate',token],queryFn:async()=>{const {data,error}=await supabase.rpc('verify_certificate',{p_token:token});if(error)throw error;return data;},enabled:!!token,retry:false});
  return <main className="min-h-screen bg-background flex items-center justify-center p-5"><div className="w-full max-w-xl rounded-2xl border bg-card p-8 shadow-lg text-center"><img src={siteConfig.logoPath} alt={siteConfig.organizationName} className="h-10 mx-auto mb-8"/>{isLoading?<Loader2 className="h-8 w-8 animate-spin mx-auto"/>:data?.valid?<><BadgeCheck className="h-16 w-16 mx-auto text-success mb-4"/><h1 className="text-2xl font-bold">Valid Certificate</h1><p className="text-muted-foreground mt-2">This completion certificate was issued by {siteConfig.organizationName}.</p><dl className="text-left rounded-xl bg-muted/40 p-5 mt-6 space-y-3">{[['Learner',data.learner_name],['Program',data.program_name],['Cohort',data.cohort_label],['Completed',new Date(data.completion_date+'T00:00:00').toLocaleDateString('en-NG',{dateStyle:'long'})],['Certificate number',data.certificate_number]].map(([label,value])=><div key={label} className="flex justify-between gap-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-sm font-medium text-right">{value}</dd></div>)}</dl></>:<><CircleX className="h-16 w-16 mx-auto text-destructive mb-4"/><h1 className="text-2xl font-bold">Certificate not valid</h1><p className="text-muted-foreground mt-2">This verification code is unknown, revoked, or the certificate has not been issued.</p></>}</div></main>;
}
