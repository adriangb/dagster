import os
import sys
from contextlib import contextmanager

import pytest
from dagster.core.test_utils import create_test_daemon_workspace, instance_for_test
from dagster.core.types.loadable_target_origin import LoadableTargetOrigin
from dagster.core.workspace.load_target import ModuleTarget


@pytest.fixture(name="instance_session_scoped", scope="session")
def instance_session_scoped_fixture():
    with instance_for_test(
        overrides={
            "run_launcher": {"module": "dagster.core.test_utils", "class": "MockedRunLauncher"}
        }
    ) as instance:
        yield instance


@pytest.fixture(name="instance", scope="function")
def instance_fixture(instance_session_scoped):
    instance_session_scoped.wipe()
    instance_session_scoped.wipe_all_schedules()
    yield instance_session_scoped


def workspace_load_target():
    return ModuleTarget(
        module_name="dagster_tests.scheduler_tests.test_scheduler_run",
        attribute=None,
        working_directory=os.getcwd(),
        location_name="test_location",
    )


@pytest.fixture(name="workspace", scope="session")
def workspace_fixture(instance_session_scoped):  # pylint: disable=unused-argument
    with create_test_daemon_workspace(workspace_load_target=workspace_load_target()) as workspace:
        yield workspace


@contextmanager
def default_repo():
    load_target = workspace_load_target()
    origin = load_target.create_origins()[0]
    with origin.create_single_location() as location:
        yield location.get_repository("the_repo")


@pytest.fixture(name="external_repo", scope="session")
def external_repo_fixture(workspace):  # pylint: disable=unused-argument
    with default_repo() as repo:
        yield repo


def loadable_target_origin():
    return LoadableTargetOrigin(
        executable_path=sys.executable,
        module_name="dagster_tests.scheduler_tests.test_scheduler_run",
        working_directory=os.getcwd(),
    )
