<!DOCTYPE html>
<html lang="en">
<?php include_once "include/header.php"; ?>
<body>

  <header>
    <a href="home.php" class="logo-header"><img src="assets/images/logo-header.png"></a>
    <div class="menu-holder">
      <a href="#" class="menu">MENU</a>
      <div class="menu-dropdown">
        <a href="home.php">Home</a>
        <a href="upload.php">Upload</a>
        <a href="download.php">Download</a>
        <a href="monitor.php" class="monitor">Monitor</a>
      </div>
    </div>
    <div class="server-name">XNATserver1.com</div>
    <a href="connection-settings.php" class="settings"><i class="fas fa-cog"></i></a>
    <div class="user-holder">
      <a href="#" class="user"><span class="name">Welcome Admin</span> <i class="fas fa-user"></i></a>
      <div class="user-dropdown">
       <span class="username">
         admin@xw2017-01.xnat.org
       </span>
       <a class="btn btn-blue" href="login-known.php">Logout</a>
     </div>
   </div>
 </header>
 <div class="container">
  <h2 class="main-title">Progress Monitor</h2>
  <div class="row">
    <div class="col"></div>
    <div class="col-10">
      <div class="alert alert-danger text-center alert-dismissible fade show" role="alert">
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
        <h2 class="red-title"><i class="fas fa-minus-circle"></i> Warning upload / download session failed !</h2>
        Upload / Download for user (user name) on server (server) failed.</br>
        Please check your monitor/log for details.
      </div>
    </div>
    <div class="col"></div>
  </div>
  <div class="row">
    <div class="col button-row">
      <button type="button" class="btn btn-blue" ><i class="far fa-pause-circle"></i> Pause All</button>
      <button type="button" class="btn btn-blue"><i class="far fa-times-circle"></i> Cancel All</button>
    </div>
  </div>
  <table class="table table-bordered filtered-table" id="table"        
  data-toggle="table"
  data-filter-control="true" 
  data-click-to-select="true"
  data-filter-show-clear="true">
  <thead>
    <tr>
      <th data-field="date" data-filter-control="input" data-sortable="true">Date</th>
      <th data-field="session" data-filter-control="input" data-sortable="true">Session</th>
      <th data-field="process" data-filter-control="select" data-sortable="true">Process</th>
      <th data-field="transfer-date" data-filter-control="input" data-sortable="true">Transfer Date</th>
      <th data-field="transfer-status" data-filter-control="select" data-sortable="true">Status</th>
      <th data-field="actions" data-escape="false" >Log download</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>2018/02/05</td>
      <td>aaa001012_mr_v1</td>
      <td>Upload</td>
      <td>2018/02/05 2:20 PM</td>
      <td>
          <div class="progress-container">
              <div class="progress-bar bg-success" role="progressbar" aria-valuenow="35" aria-valuemin="0" aria-valuemax="100" style="width:35%; height:25px;">
                  <span class="sr-only">In progress</span>
              </div>
          </div>
        
      </td>
      <td><button class="btn btn-block btn-info" data-toggle="modal" data-target="#upload-details"><i class="fas fa-upload"></i> Details</button></td>
    </tr>
    <tr>
      <td>2018/02/06</td>
      <td>001012_mr_v1</td>
      <td>Download</td>
      <td>2018/02/06 2:20 PM</td>
      <td>
      <div class="progress" style="height: 20px;">
        <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="75" aria-valuemin="0" aria-valuemax="100" style="width: 75%;"></div>
      </div>
      
        <div class="progress-bar bg-success" role="progressbar" aria-valuenow="70" aria-valuemin="0" aria-valuemax="100" style="width:70%; height:25px;">
          <span class="sr-only">In progress</span>
        </div>
      </td>
      <td><button class="btn btn-block btn-info" data-toggle="modal" data-target="#download-details"><i class="fas fa-download"></i> Details</button></td>
    </tr>
    <tr>
      <td>2018/02/07</td>
      <td>001012_mr_v1</td>
      <td>Upload</td>
      <td>2018/02/07 2:20 PM</td>
      <td>Finished</td>
      <td><button class="btn btn-block btn-success" data-toggle="modal" data-target="#success-log"><i class="fas fa-download"></i> Log</button></td>
    </tr>
    <tr>
      <td>2018/02/08</td>
      <td>001012_mr_v1</td>
      <td>Download</td>
      <td>2018/02/08 2:20 PM</td>
      <td><i class="fas fa-exclamation-triangle"></i> XNAT Error</td>
      <td><button class="btn btn-block btn-danger" data-toggle="modal" data-target="#error-log"><i class="fas fa-exclamation-triangle"></i> Log</button></td>
    </tr>
    <tr>
      <td>2018/02/09</td>
      <td>001012_mr_v1</td>
      <td>Upload</td>
      <td>2018/02/09 2:20 PM</td>
      <td>Queued</td>
      <td><button class="btn btn-block btn-warning" disabled><i class="far fa-pause-circle"></i> Queued</button></td>
    </tr>
    <tr>
      <td>2018/02/05</td>
      <td>001012_mr_v1</td>
      <td>Upload</td>
      <td>2018/02/05 2:20 PM</td>
      <td><i class="fas fa-exclamation-triangle"></i> XNAT Error</td>
      <td><button class="btn btn-block btn-danger" data-toggle="modal" data-target="#error-log"><i class="fas fa-exclamation-triangle"></i> Log</button></td>
    </tr>
    <tr>
      <td>2018/02/06</td>
      <td>001012_mr_v1</td>
      <td>Download</td>
      <td>2018/02/06 2:20 PM</td>
      <td>
        <div class="progress-bar bg-success" role="progressbar" aria-valuenow="30" aria-valuemin="0" aria-valuemax="100" style="width:30%; height:25px;">
          <span class="sr-only">In progress</span>
        </div>
      </td>
      <td><button class="btn btn-block btn-info" data-toggle="modal" data-target="#download-details"><i class="fas fa-download"></i> Details</button></td>
    </tr>
    <tr>
      <td>2018/02/07</td>
      <td>001012_mr_v1</td>
      <td>Upload</td>
      <td>2018/02/07 2:20 PM</td>
      <td>Finished</td>
      <td><button class="btn btn-block btn-success" data-toggle="modal" data-target="#success-log"><i class="fas fa-download"></i> Log</button></td>
    </tr>
    <tr>
      <td>2018/02/08</td>
      <td>001012_mr_v1</td>
      <td>Download</td>
      <td>2018/02/08 2:20 PM</td>
      <td>Finished</td>
      <td><button class="btn btn-block btn-success" data-toggle="modal" data-target="#success-log"><i class="fas fa-download"></i> Log</button></td>
    </tr>
    <tr>
      <td>2018/02/09</td>
      <td>001012_mr_v1</td>
      <td>Upload</td>
      <td>2018/02/09 2:20 PM</td>
      <td>Finished</td>
      <td><button class="btn btn-block btn-success" data-toggle="modal" data-target="#success-log"><i class="fas fa-download"></i> Log</button></td>
    </tr>
  </tbody>
</table>
</div>




</div>
<!-- Modal -->
<div class="modal fade" id="error-log" tabindex="-1" role="dialog" aria-labelledby="loginTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLongTitle">Error log</h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <i class="far fa-window-close"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="log-text">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-gray" data-dismiss="modal">Close</button>
        <button type="button" class="btn btn-blue">Save log as TXT</button>
        <button type="button" class="btn btn-blue">Save log as PDF</button>
      </div>
    </div>
  </div>
</div>
<!-- Modal -->
<div class="modal fade" id="success-log" tabindex="-1" role="dialog" aria-labelledby="loginTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLongTitle">Transfer log</h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <i class="far fa-window-close"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="log-text">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-gray" data-dismiss="modal">Close</button>
        <button type="button" class="btn btn-blue">Save log as TXT</button>
        <button type="button" class="btn btn-blue">Save log as PDF</button>
      </div>
    </div>
  </div>
</div>

<!-- Modal -->
<div class="modal fade" id="upload-details" tabindex="-1" role="dialog" aria-labelledby="loginTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLongTitle">Session transfer details <br> <span class="session-id">001012_mr_v1</span></h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <i class="far fa-window-close"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="process-details">
          <table class="table table-bordered" id="table"        
          data-toggle="table"
          data-click-to-select="true">
          <thead>
            <tr>
              <th data-field="scan-type"  data-sortable="true">Scan Type</th>
              <th data-field="series-number" data-sortable="true">S/N</th>
              <th data-field="upload-progress">Upload Progress</th>
              <th data-field="file-count" data-sortable="true">File Count</th>
              <th data-field="size" data-sortable="true">Size (bytes)</th>

            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97841</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="70" aria-valuemin="0" aria-valuemax="100" style="width:70%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>8</td>
              <td>1.19 MB</td>
            </tr>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97842</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="90" aria-valuemin="0" aria-valuemax="100" style="width:90%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>2</td>
              <td>1.12 MB</td>
            </tr>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97843</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100" style="width:40%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>5</td>
              <td>1.10 MB</td>
            </tr>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97844</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100" style="width:60%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>7</td>
              <td>1.11 MB</td>
            </tr>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97845</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="20" aria-valuemin="0" aria-valuemax="100" style="width:20%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>8</td>
              <td>1.13 MB</td>
            </tr>
          </tbody>
           </table>
           <p>
              Estimated time left: 3min 45sec <br/>
              Transfer rate: 100KB/sec
           </p>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-gray" disabled>Go to summary</button>
        <button type="button" class="btn btn-blue"><i class="far fa-pause-circle"></i> Pause</button>
        <button type="button" class="btn btn-blue"><i class="far fa-stop-circle"></i> Stop</button>
      </div>
    </div>
  </div>
</div>
<!-- Modal -->
<div class="modal fade" id="download-details" tabindex="-1" role="dialog" aria-labelledby="loginTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLongTitle">Session transfer details <br> <span class="session-id">001012_mr_v1</span></h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <i class="far fa-window-close"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="process-details">
          <table class="table table-bordered" id="table"        
          data-toggle="table"
          data-click-to-select="true">
          <thead>
            <tr>
              <th data-field="scan-type"  data-sortable="true">Scan Type</th>
              <th data-field="scan-id" data-sortable="true">Scan ID</th>
              <th data-field="download-progress">Download Progress</th>
              <th data-field="file-count" data-sortable="true">File Count</th>
              <th data-field="size" data-sortable="true">Size (bytes)</th>

            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97841</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="70" aria-valuemin="0" aria-valuemax="100" style="width:70%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>8</td>
              <td>1.19 MB</td>
            </tr>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97842</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="90" aria-valuemin="0" aria-valuemax="100" style="width:90%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>2</td>
              <td>1.12 MB</td>
            </tr>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97843</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100" style="width:40%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>5</td>
              <td>1.10 MB</td>
            </tr>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97844</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100" style="width:60%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>7</td>
              <td>1.11 MB</td>
            </tr>
            <tr>
              <td>Lorem ipsum dolor sit amet</td>
              <td>97845</td>
              <td>
                <div class="progress-bar bg-success" role="progressbar" aria-valuenow="20" aria-valuemin="0" aria-valuemax="100" style="width:20%; height:25px;">
                  <span class="sr-only">In progress</span>
                </div>
              </td>
              <td>8</td>
              <td>1.13 MB</td>
            </tr>
          </tbody>
           </table>
           <p>
              Estimated time left: 3min 45sec <br/>
              Transfer rate: 100KB/sec
           </p>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-blue"><i class="far fa-pause-circle"></i> Pause</button>
        <button type="button" class="btn btn-blue"><i class="far fa-stop-circle"></i> Stop</button>
      </div>
    </div>
  </div>
</div>
<?php include_once "include/footer.php"; ?>