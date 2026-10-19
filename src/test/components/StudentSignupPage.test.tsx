import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryWrapper } from '@/test/testUtils';
import { V2_REQUIRED_PROFILE_FIELDS } from '@/lib/registrationProfile';

const { from, rpc, progress } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), progress: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from, rpc } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id:'student' }, loading:false }) }));
vi.mock('@/lib/registration', () => ({ getRegistrationProgress:progress, registrationError:(error: {message:string})=>error.message }));
import StudentSignupPage from '@/pages/public/StudentSignupPage';

const enrollment={id:'enrollment',full_name:'Applicant',email:'applicant@example.test',program_name:'Web',hub_id:'00000000-0000-0000-0000-000000000001',profile_requirements_version:2};
function form() {
  const Wrapper=createQueryWrapper();
  return render(<Wrapper><MemoryRouter initialEntries={['/students/enrollment']}><Routes><Route path="/students/:id" element={<StudentSignupPage />} /></Routes></MemoryRouter></Wrapper>);
}
function fieldsResult(data: unknown[], error: unknown=null) {
  const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),or:vi.fn().mockReturnThis(),order:vi.fn().mockResolvedValue({data,error})};
  from.mockReturnValue(query);
}
beforeEach(()=>{
  vi.clearAllMocks();
  progress.mockResolvedValue({dashboard_access:false,registrations:[{id:'enrollment',registration_flow_version:2,profile_available:true,registration_number:'REG-2026-000003'}]});
  rpc.mockImplementation(name=>Promise.resolve({data:name==='get_enrollment_for_completion'?[enrollment]:[],error:null}));
});
describe('segment 2 profile setup',()=>{
  it('blocks completion when the required form definitions are missing',async()=>{
    fieldsResult([]);form();
    expect(await screen.findByRole('alert')).toHaveTextContent('Registration form unavailable');
    expect(screen.getByRole('button',{name:'Save & Complete'})).toBeDisabled();
    expect(screen.queryByText('No additional fields are required at this time.')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('submit_enrollment_fields',expect.anything());
  });
  it('renders all required questions when the profile is configured',async()=>{
    fieldsResult(V2_REQUIRED_PROFILE_FIELDS.map((key,index)=>({id:key,key,label:key,field_type:'text',required:false,sort_order:index,options:null})));form();
    await waitFor(()=>expect(screen.getByRole('button',{name:'Save & Complete'})).toBeEnabled());
    for(const key of V2_REQUIRED_PROFILE_FIELDS) expect(screen.getByLabelText(`${key} *`)).toBeRequired();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('prefills saved name components without splitting a legacy full name',async()=>{
    rpc.mockImplementation(name=>Promise.resolve({data:name==='get_enrollment_for_completion'?[enrollment]:name==='get_enrollment_field_values'?[{field_key:'first_name',value:'Mary Jane'},{field_key:'surname',value:"O'Connor-Smith"}]:[],error:null}));
    fieldsResult(V2_REQUIRED_PROFILE_FIELDS.map((key,index)=>({id:key,key,label:key,field_type:'text',required:false,sort_order:index,options:null})));form();
    await waitFor(()=>expect(screen.getByLabelText('first_name *')).toHaveValue('Mary Jane'));
    expect(screen.getByLabelText('surname *')).toHaveValue("O'Connor-Smith");
  });
  it('shows field query failures instead of treating them as an empty form',async()=>{
    fieldsResult([],{message:'Unable to fetch profile fields'});form();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to fetch profile fields');
    expect(screen.getByRole('button',{name:'Save & Complete'})).toBeDisabled();
  });
});
