import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { Route, Switch } from 'react-router-dom';
import styled from 'styled-components';
import LoginPage from './components/account/LoginPage';
import LoginProvider from './components/common/LoginProvider';
import SchedulePanel from './components/schedule/SchedulePanel';
import { updateTodayLoop } from './reducer/schedulesSlice';

const Container = styled.div`
  text-align: center;
  display: inline;

  > .aligned.middle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
`;

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(updateTodayLoop);
  });

  return (
    <Container>
      <LoginProvider>
        <Switch>
          <Route
            exact
            path="/"
          >
            <SchedulePanel />
          </Route>
          <Route path="/login">
            <LoginPage />
          </Route>
        </Switch>
      </LoginProvider>
    </Container>
  );
}

export default App;
