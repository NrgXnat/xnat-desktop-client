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
 <div class="container-fluid">
   <div class="row">
     <h2 class="main-title">Download Image Session from ( XNAT Name )</h2>
     <h3 class="step-description">Project: ( Project name ), ( NNN ) Sessions Selected</h3>
     <nav>
      <div class="nav nav-tabs" id="nav-tab" role="tablist">
        <a class="nav-item nav-link"  data-toggle="tab" href="#nav-project" role="tab" aria-controls="nav-project" aria-selected="true">Select Project</a>
        <a class="nav-item nav-link" data-toggle="tab" href="#nav-folder" role="tab" aria-controls="nav-folder" aria-selected="false">Select Sessions</a>
        <a class="nav-item nav-link active" data-toggle="tab" href="#nav-date" role="tab" aria-controls="nav-date" aria-selected="false">Select Scans</a>
        <a class="nav-item nav-link disabled" data-toggle="tab" href="#nav-verify" role="tab" aria-controls="nav-verify" aria-selected="false">Finalize Download Request</a>
      </div>
    </nav>
    <div class="tab-content" id="nav-tabContent">
      <div class="tab-pane fade" id="nav-project" role="tabpanel" aria-labelledby="nav-home-tab">
        <h2 class="section-title">Select project to download from</h2>
        <div class="filter-control">
          <input type="text" id="upload-project-filter" onkeyup="myFunction()" placeholder="Filter" class="form-control">
        </div>
        <ul id="upload-project" class="choose-list">
          <li><a href="#">XNAT_1</a></li>
          <li><a href="#">XNAT_2</a></li>
          <li><a href="#">XNAT_3</a></li>
          <li><a href="#">XNAT_4</a></li>
          <li><a href="#">XNAT_5</a></li>
          <li><a href="#">XNAT_6</a></li>
          <li><a href="#">XNAT_7</a></li>
        </ul>
        <div class="row">
          <div class="col text-right button-row">
            <button type="button" class="btn btn-gray" type="button" >Cancel</button>
            <button type="button" class="btn btn-blue">Next <i class="fas fa-angle-right"></i></button>
          </div>
        </div>
      </div>
      <div class="tab-pane fade" id="nav-folder" role="tabpanel" aria-labelledby="nav-folder-tab"> 
        <h2 class="section-title">Select folder of files to download</h2>
        
        <table class="table table-bordered filtered-table" id="table2"        
        data-toggle="table"
        data-filter-control="true" 
        data-click-to-select="true"
        data-height="300">
        <thead>
          <tr>
            <th data-field="select" data-checkbox="true">Download</th>
            <th data-field="session_label"  data-sortable="true" data-filter-control="input">Session label</th>
            <th data-field="modality"  data-sortable="true" data-filter-control="input">Modality</th>
            <th data-field="download_subject" data-sortable="true" data-filter-control="input">Subject</th>
            <th data-field="scans_count"  data-sortable="true" data-filter-control="input">Scans</th>
            <th data-field="session_date"  data-sortable="true" data-filter-control="input">Session date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td></td>
            <td><div class="folder-name">Session label 1</div></td>
            <td>
              MR, BI, CR
            </td>
            <td>Subject Xy</td>
            <td>3</td>
            <td>2017/07/21</td>
          </tr>
          <tr>
            <td></td>
            <td><div class="folder-name">Session label 2</div></td>
            <td>
              BI, CR
            </td>
            <td>Subject Xy</td>
            <td>5</td>
            <td>2017/07/21</td>
          </tr>
          <tr>
            <td></td>
            <td><div class="folder-name">Session label 3</div></td>
            <td>
             MR
           </td>
           <td>Subject Xy</td>
           <td>5</td>
           <td>2017/07/21</td>
         </tr>
         <tr>
          <td></td>
          <td><div class="folder-name">Session label 4</div></td>
          <td>
            CR
          </td>
          <td>Subject Xy</td>
          <td>4</td>
          <td>2017/07/21</td>
        </tr>
        <tr>
          <td></td>
          <td><div class="folder-name">Session label 5</div></td>
          <td>
            BI, CR
          </td>
          <td>Subject Xy</td>
          <td>7</td>
          <td>2017/07/21</td>
        </tr>
        <tr>
          <td></td>
          <td><div class="folder-name">Session label 6</div></td>
          <td>
           BI, CR
         </td>
         <td>Subject Xy</td>
         <td>5</td>
         <td>2017/07/21</td>
       </tr>
       <tr>
        <td></td>
        <td><div class="folder-name">Session label 7</div></td>
        <td>
         MR, BI, CR
       </td>
       <td>Subject Xy</td>
       <td>3</td>
       <td>2017/07/21</td>
     </tr>
   </tbody>
 </table>


 <div class="col text-right button-row">
  <button type="button" class="btn btn-gray">Cancel</button>
  <button type="button" class="btn btn-gray" type="button" ><i class="fas fa-angle-left"></i> Prev</button>
  <button type="button" class="btn btn-blue">Next <i class="fas fa-angle-right"></i></button>
</div>
</div>
<div class="tab-pane fade show active" id="nav-date" role="tabpanel" aria-labelledby="nav-date-tab">
 <h2 class="section-title">Select project to download from</h2>
 <div class="datalist-1">
  <div class="select-all-control"><input type="checkbox" name="selectall" id="selectall" class="select-format" value="1"> <label for="selectall2">All</label></div>
  <div class="filter-control inline-control">
    <input type="text" id="file-format-filter" onkeyup="formatFilter()" placeholder="Filter" class="form-control">
  </div>
  <ul id="scan-format" class="choose-list list-selectable">
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="1" id="format1"> <label for="format1">Scan format A</label></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="2" id="format2"> <label for="format2">Scan format B</label></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="3" id="format3"> <label for="format3">Scan format C</label></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="4" id="format4"> <label for="format4">Scan format D</label></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="5" id="format5"> <label for="format5">Scan format E</label></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="6" id="format6"> <label for="format6">Scan format F</label></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="7" id="format7"> <label for="format7">Scan format G</label></a></li>
  </ul>
</div>
<h2 class="section-title">Select project to download from</h2>
<div class="datalist-2">
  <div class="select-all-control"><input type="checkbox" name="selectall2" id="selectall2" class="select-type" value="1"> <label for="selectall2">All</label></div>
  <div class="filter-control inline-control">
    <input type="text" id="file-type-filter" onkeyup="typeFilter()" placeholder="Filter" class="form-control">
  </div>
  <ul id="scan-type" class="choose-list list-selectable">
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="1" id="type1"> <label for="type1">Scan type A</label> <span class="file_count">(20)</span></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="2" id="type2"> <label for="type2">Scan type B</label> <span class="file_count">(12)</span></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="3" id="type3"> <label for="type3">Scan type C</label> <span class="file_count">(3)</span></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="4" id="type4"> <label for="type4">Scan type D</label> <span class="file_count">(17)</span></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="5" id="type5"> <label for="type5">Scan type E</label> <span class="file_count">(25)</span></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="6" id="type6"> <label for="type6">Scan type F</label> <span class="file_count">(44)</span></a></li>
    <li><a href="#"><input type="checkbox" name="check[]" class="checkbox" value="7" id="type7"> <label for="type7">Scan type G</label> <span class="file_count">(7)</span></a></li>
  </ul>
</div>
<div class="row">
  <div class="col text-right button-row">
    <button type="button" class="btn btn-gray" type="button" >Cancel</button>
    <button type="button" class="btn btn-blue">Next <i class="fas fa-angle-right"></i></button>
  </div>
</div>
</div>
<div class="tab-pane fade" id="nav-verify" role="tabpanel" aria-labelledby="nav-home-tab">
  <h2 class="section-title">Select Local Directory</h2>

  <div class="row">
    <div class="col">
      <div id="selectSource">
        <input type="file" id="file_default_local_storage" webkitdirectory directory>
      </div>
    </div>
  </div>
  <form action="" class="download-radio-selection">
    <div class="form-check">
      <input class="form-check-input" type="radio" name="download" id="radio1" value="option1" checked>
      <label class="form-check-label" for="radio1">
       Standard XNAT (default)
     </label>
   </div>
   <div class="form-check">
    <input class="form-check-input" type="radio" name="download" id="radio2" value="option2">
    <label class="form-check-label" for="radio2">
      Simple XNAT
    </label>
  </div>
  <div class="form-check">
    <input class="form-check-input" type="radio" name="download" id="radio3" value="option3">
    BIDS
  </label>
</div>
</form>


<div class="row">
  <div class="col text-right button-row">
    <button type="button" class="btn btn-gray">Cancel</button>
    <button type="button" class="btn btn-gray" type="button" ><i class="fas fa-angle-left"></i> Prev</button>
    <button type="button" class="btn btn-blue">Download</button>
  </div>
</div>
</div>
</div>

</div>
</div>
<?php include_once "include/footer.php"; ?>